// Agendador dos lembretes automáticos - cada clínica liga/desliga e edita a
// mensagem de cada um em Configurações > Lembretes automáticos (tudo
// desligado por padrão). Reaproveita o mesmo caminho de envio real que
// "Conversar no WhatsApp" e "Enviar parabéns" já usam manualmente - a
// única diferença é que aqui quem aperta "enviar" é o relógio, não um
// atendente.
import cron from 'node-cron'
import { prisma } from '../db.ts'
import { enviarLembrete } from '../lib/whatsapp.ts'

const FUSO = 'America/Sao_Paulo'

function substituir(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, chave: string) => vars[chave] ?? '')
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome

/** YYYY-MM-DD do dia (fuso do Brasil), hoje + offsetDias. */
function diaBrasil(offsetDias = 0): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDias)
  return d.toLocaleDateString('en-CA', { timeZone: FUSO })
}

/** Início do dia (00:00 no fuso do Brasil) como Date UTC - -03:00 é seguro o ano todo, Brasil não tem mais horário de verão desde 2019. */
const inicioDoDiaBrasil = (diaISO: string) => new Date(`${diaISO}T00:00:00-03:00`)

function horaBrasil(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO })
}

/** Confirmação de consulta 24h antes: consultas de amanhã, ainda não confirmadas/lembradas. */
async function jobConfirmacao24h() {
  const amanha = diaBrasil(1)
  const consultas = await prisma.consulta.findMany({
    where: {
      status: { in: ['AGENDADA', 'CONFIRMADA'] },
      confirmacaoEnviada: false,
      inicio: { gte: inicioDoDiaBrasil(amanha), lt: inicioDoDiaBrasil(diaBrasil(2)) },
      clinica: { lembreteConfirmacao24hAtivo: true },
    },
    include: { paciente: true, clinica: { select: { lembreteConfirmacao24hMensagem: true } } },
  })
  for (const c of consultas) {
    const texto = substituir(c.clinica.lembreteConfirmacao24hMensagem, { nome: primeiroNome(c.paciente.nome), hora: horaBrasil(c.inicio) })
    await enviarLembrete(c.clinicaId, c.pacienteId, c.paciente.telefone, c.paciente.nome, texto)
    await prisma.consulta.update({ where: { id: c.id }, data: { confirmacaoEnviada: true } })
  }
  return consultas.length
}

/** Lembrete no dia: consultas de hoje, ainda não lembradas. */
async function jobLembreteDia() {
  const hoje = diaBrasil(0)
  const consultas = await prisma.consulta.findMany({
    where: {
      status: { in: ['AGENDADA', 'CONFIRMADA'] },
      lembreteDiaEnviado: false,
      inicio: { gte: inicioDoDiaBrasil(hoje), lt: inicioDoDiaBrasil(diaBrasil(1)) },
      clinica: { lembreteDiaConsultaAtivo: true },
    },
    include: { paciente: true, clinica: { select: { lembreteDiaConsultaMensagem: true } } },
  })
  for (const c of consultas) {
    const texto = substituir(c.clinica.lembreteDiaConsultaMensagem, { nome: primeiroNome(c.paciente.nome), hora: horaBrasil(c.inicio) })
    await enviarLembrete(c.clinicaId, c.pacienteId, c.paciente.telefone, c.paciente.nome, texto)
    await prisma.consulta.update({ where: { id: c.id }, data: { lembreteDiaEnviado: true } })
  }
  return consultas.length
}

/** Aniversário: pacientes que fazem aniversário hoje, ainda não parabenizados hoje. */
async function jobAniversario() {
  const hoje = new Date()
  const mes = hoje.getUTCMonth() + 1
  const dia = hoje.getUTCDate()
  const clinicas = await prisma.clinica.findMany({
    where: { lembreteAniversarioAtivo: true },
    select: { id: true, lembreteAniversarioMensagem: true },
  })
  let total = 0
  for (const clinica of clinicas) {
    const pacientes = await prisma.$queryRaw<{ id: string; nome: string; telefone: string }[]>`
      SELECT id, nome, telefone FROM "Paciente"
      WHERE "clinicaId" = ${clinica.id}
        AND nascimento IS NOT NULL
        AND EXTRACT(MONTH FROM nascimento) = ${mes}
        AND EXTRACT(DAY FROM nascimento) = ${dia}
        AND (("ultimoParabensEm") IS NULL OR "ultimoParabensEm" < ${inicioDoDiaBrasil(diaBrasil(0))})
    `
    for (const p of pacientes) {
      const texto = substituir(clinica.lembreteAniversarioMensagem, { nome: primeiroNome(p.nome) })
      await enviarLembrete(clinica.id, p.id, p.telefone, p.nome, texto)
      await prisma.paciente.update({ where: { id: p.id }, data: { ultimoParabensEm: new Date() } })
      total++
    }
  }
  return total
}

/** Campanha de retorno: pacientes sem visita concluída há mais tempo que o limite da clínica, contatados no máximo 1x por mês. */
async function jobCampanhaRetorno() {
  const clinicas = await prisma.clinica.findMany({
    where: { lembreteRetornoAtivo: true },
    select: { id: true, lembreteRetornoMensagem: true, lembreteRetornoMesesLimite: true },
  })
  let total = 0
  for (const clinica of clinicas) {
    const limite = new Date()
    limite.setMonth(limite.getMonth() - clinica.lembreteRetornoMesesLimite)
    const umMesAtras = new Date()
    umMesAtras.setMonth(umMesAtras.getMonth() - 1)

    const pacientes = await prisma.paciente.findMany({
      where: {
        clinicaId: clinica.id,
        status: { not: 'INATIVO' },
        OR: [{ ultimaCampanhaRetornoEm: null }, { ultimaCampanhaRetornoEm: { lt: umMesAtras } }],
        consultas: { none: { status: 'CONCLUIDA', inicio: { gte: limite } } },
        // só quem já teve alguma consulta concluída antes do limite (senão seria "nunca veio", caso diferente de "sumiu")
        AND: [{ consultas: { some: { status: 'CONCLUIDA' } } }],
      },
      select: { id: true, nome: true, telefone: true },
    })
    for (const p of pacientes) {
      const texto = substituir(clinica.lembreteRetornoMensagem, { nome: primeiroNome(p.nome) })
      await enviarLembrete(clinica.id, p.id, p.telefone, p.nome, texto)
      await prisma.paciente.update({ where: { id: p.id }, data: { ultimaCampanhaRetornoEm: new Date() } })
      total++
    }
  }
  return total
}

/** Pesquisa de satisfação: consultas concluídas recentemente (última hora), ainda sem pesquisa enviada. Roda mais vezes ao dia que os outros, pra chegar logo depois do atendimento. */
async function jobPesquisaSatisfacao() {
  const umaHoraAtras = new Date(Date.now() - 3_600_000)
  const consultas = await prisma.consulta.findMany({
    where: {
      status: 'CONCLUIDA',
      pesquisaSatisfacaoEnviada: false,
      atualizadoEm: { gte: umaHoraAtras },
      clinica: { lembretePesquisaSatisfacaoAtivo: true },
    },
    include: { paciente: true, clinica: { select: { lembretePesquisaSatisfacaoMensagem: true } } },
  })
  for (const c of consultas) {
    const texto = substituir(c.clinica.lembretePesquisaSatisfacaoMensagem, { nome: primeiroNome(c.paciente.nome) })
    await enviarLembrete(c.clinicaId, c.pacienteId, c.paciente.telefone, c.paciente.nome, texto)
    await prisma.consulta.update({ where: { id: c.id }, data: { pesquisaSatisfacaoEnviada: true } })
  }
  return consultas.length
}

/** Roda todos os jobs diários agora - exportado à parte pra poder testar/disparar na mão, sem esperar o cron. */
export async function rodarJobsDiarios() {
  const resultados = {
    confirmacao24h: await jobConfirmacao24h(),
    lembreteDia: await jobLembreteDia(),
    aniversario: await jobAniversario(),
    campanhaRetorno: await jobCampanhaRetorno(),
  }
  console.log('[lembretes] jobs diários:', resultados)
  return resultados
}

export async function rodarJobPesquisaSatisfacao() {
  const total = await jobPesquisaSatisfacao()
  if (total > 0) console.log('[lembretes] pesquisas de satisfação enviadas:', total)
  return total
}

/** Inicia o agendador - chamar uma vez, no boot do processo "api". */
export function iniciarAgendadorDeLembretes() {
  // 11:00 UTC = 08:00 em Brasília (sem horario de verao desde 2019)
  cron.schedule('0 11 * * *', () => {
    rodarJobsDiarios().catch((e) => console.error('[lembretes] erro nos jobs diários:', e))
  })
  // A cada hora, no minuto 15 - pesquisa de satisfacao precisa ser mais rapida que 1x/dia.
  cron.schedule('15 * * * *', () => {
    rodarJobPesquisaSatisfacao().catch((e) => console.error('[lembretes] erro na pesquisa de satisfação:', e))
  })
  console.log('[lembretes] agendador iniciado (jobs diários às 08:00, pesquisa de satisfação a cada hora)')
}
