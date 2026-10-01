// Ferramentas MCP de odontologia - usam o MESMO nome e MESMOS parametros
// (agent_id, numero_whatsapp, data, periodo, profissional_id, data_hora...)
// que o motor do Orquestrador (spooker-platform) ja chama hoje contra o
// agenda-mcp generico. Isso significa ZERO mudanca no motor do Chatbot
// (Fluxo 2) ou nas regras da IA (Fluxo 1) - so troca de onde o dado vem.
//
// agent_id chega automaticamente em toda chamada (o Orquestrador injeta
// isso sozinho) e aqui vira o id da Clinica via Clinica.agentId - nenhuma
// chamada de rede entre os dois bancos, so uma consulta local.

import { prisma } from '../db.ts'
import { normalizarTelefone } from '../lib/http.ts'
import { emHorario } from '../lib/tempo.ts'

const OCUPAM = ['AGENDADA', 'CONFIRMADA', 'EM_ATENDIMENTO', 'CONCLUIDA'] as const
const DURACAO_PADRAO_MIN = 30
const MAX_HORARIOS_MOSTRADOS = 8

export class ErroFerramenta extends Error {}

export async function resolverClinicaId(agentId: number): Promise<string> {
  const clinica = await prisma.clinica.findUnique({ where: { agentId } })
  if (!clinica) throw new ErroFerramenta(`Nenhuma clínica do Portal Odonto está ligada ao agente ${agentId}.`)
  return clinica.id
}

/** Quando profissional_id não vem informado: só funciona se a clínica tiver exatamente 1 dentista ativo. */
async function resolverProfissionalId(clinicaId: string, profissionalId?: string): Promise<string> {
  if (profissionalId) return profissionalId
  const ativos = await prisma.profissional.findMany({ where: { clinicaId, ativo: true, funcao: 'DENTISTA' } })
  if (ativos.length !== 1) {
    throw new ErroFerramenta('Informe o profissional - esta clínica tem mais de um dentista ativo (ou nenhum).')
  }
  return ativos[0].id
}

export async function listarProfissionais(args: { agent_id: number }) {
  const clinicaId = await resolverClinicaId(args.agent_id)
  const profissionais = await prisma.profissional.findMany({
    where: { clinicaId, ativo: true, funcao: 'DENTISTA' },
    orderBy: { nome: 'asc' },
  })
  return profissionais.map((p) => ({ id: p.id, nome: p.nome, especialidade: p.especialidade, ativo: p.ativo }))
}

const JANELAS_PERIODO: Record<string, [string, string]> = {
  manha: ['00:00', '12:00'],
  tarde: ['12:00', '18:00'],
  noite: ['18:00', '23:59'],
}

export async function buscarHorariosDisponiveis(args: {
  agent_id: number
  data: string
  periodo?: string
  profissional_id?: string
}) {
  try {
    const clinicaId = await resolverClinicaId(args.agent_id)
    const profissionalId = await resolverProfissionalId(clinicaId, args.profissional_id)

    const diaSemana = new Date(`${args.data}T12:00:00Z`).getUTCDay()
    const horario = await prisma.horarioAtendimento.findUnique({ where: { clinicaId_diaSemana: { clinicaId, diaSemana } } })
    if (!horario?.ativo) return { horarios_livres: [] }

    const [iniP, fimP] = (args.periodo && JANELAS_PERIODO[args.periodo]) || ['00:00', '23:59']
    const abre = horario.abre > iniP ? horario.abre : iniP
    const fecha = horario.fecha < fimP ? horario.fecha : fimP
    if (abre >= fecha) return { horarios_livres: [] }

    const ocupadas = await prisma.consulta.findMany({
      where: {
        clinicaId,
        profissionalId,
        status: { in: [...OCUPAM] },
        inicio: { lt: emHorario(args.data, horario.fecha) },
        fim: { gt: emHorario(args.data, horario.abre) },
      },
      select: { inicio: true, fim: true },
    })

    const livres: string[] = []
    const agora = new Date()
    const fechamento = emHorario(args.data, fecha).getTime()
    for (
      let t = emHorario(args.data, abre).getTime();
      t + DURACAO_PADRAO_MIN * 60_000 <= fechamento && livres.length < MAX_HORARIOS_MOSTRADOS;
      t += DURACAO_PADRAO_MIN * 60_000
    ) {
      const inicio = new Date(t)
      const fim = new Date(t + DURACAO_PADRAO_MIN * 60_000)
      if (inicio < agora) continue
      if (ocupadas.some((c) => c.inicio < fim && c.fim > inicio)) continue
      livres.push(inicio.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }))
    }
    return { horarios_livres: livres }
  } catch (e) {
    if (e instanceof ErroFerramenta) return { erro: e.message }
    throw e
  }
}

export async function agendarConsulta(args: {
  agent_id: number
  numero_whatsapp: string
  nome_paciente?: string
  data_hora: string
  tipo_consulta?: string
  profissional_id?: string
}) {
  try {
    const clinicaId = await resolverClinicaId(args.agent_id)
    const profissionalId = await resolverProfissionalId(clinicaId, args.profissional_id)
    const telefone = normalizarTelefone((args.numero_whatsapp || '').split('@')[0])
    if (!telefone) return { erro: 'numero_whatsapp inválido' }

    const [dataParte, horaParte] = (args.data_hora || '').trim().split(' ')
    if (!dataParte || !horaParte) return { erro: 'data_hora inválido, use o formato AAAA-MM-DD HH:MM' }
    const inicio = emHorario(dataParte, horaParte)
    if (Number.isNaN(inicio.getTime())) return { erro: 'data_hora inválido' }
    if (inicio < new Date()) return { erro: 'Não é possível agendar em um horário que já passou' }
    const fim = new Date(inicio.getTime() + DURACAO_PADRAO_MIN * 60_000)

    const conflito = await prisma.consulta.findFirst({
      where: { profissionalId, status: { in: [...OCUPAM] }, inicio: { lt: fim }, fim: { gt: inicio } },
    })
    if (conflito) return { erro: 'Esse horário acabou de ficar indisponível, escolha outro' }

    let paciente = await prisma.paciente.findUnique({ where: { clinicaId_telefone: { clinicaId, telefone } } })
    if (!paciente) {
      paciente = await prisma.paciente.create({
        data: { clinicaId, nome: args.nome_paciente?.trim() || 'Paciente WhatsApp', telefone },
      })
    }

    const consulta = await prisma.consulta.create({
      data: { clinicaId, pacienteId: paciente.id, profissionalId, inicio, fim, observacoes: args.tipo_consulta || null },
    })
    return { status: 'agendado', consulta_id: consulta.id, inicio: consulta.inicio.toISOString() }
  } catch (e) {
    if (e instanceof ErroFerramenta) return { erro: e.message }
    throw e
  }
}

export async function buscarItemCatalogo(args: { agent_id: number; busca: string }) {
  try {
    const clinicaId = await resolverClinicaId(args.agent_id)
    const itens = await prisma.procedimento.findMany({ where: { clinicaId, ativo: true } })

    // Busca nos dois sentidos: "limpeza" acha "Limpeza dentária" e
    // "limpeza dentária" acha "Limpeza" - nem sempre o cliente usa o
    // nome exatamente igual ao cadastrado.
    const buscaNorm = args.busca.trim().toLowerCase()
    const item =
      itens.find((i) => i.nome.toLowerCase().includes(buscaNorm) || buscaNorm.includes(i.nome.toLowerCase())) ??
      // ultimo recurso: alguma palavra em comum (ex: busca "fazer limpeza" bate com "Limpeza")
      itens.find((i) => i.nome.toLowerCase().split(/\s+/).some((palavra) => buscaNorm.split(/\s+/).includes(palavra)))

    if (!item) return { erro: 'Procedimento não encontrado no catálogo' }
    return { nome: item.nome, valor: Number(item.valor), duracao_min: item.duracaoMin }
  } catch (e) {
    if (e instanceof ErroFerramenta) return { erro: e.message }
    throw e
  }
}

/**
 * Nome EXATO exigido: o Orquestrador detecta escalacao pelo nome dessa
 * ferramenta (ai_service.py: _ESCALATION_TOOL_NAME) e ele mesmo marca o
 * estado da conversa como escalada - aqui so precisa existir e responder.
 */
export async function escalarParaHumano(_args: { agent_id: number; numero_whatsapp: string; motivo?: string }) {
  return { status: 'escalado' }
}
