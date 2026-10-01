// Dados de demonstração: npm run db:seed
// Logins (senha demo1234): admin@demo.com (administrador), recepcao@demo.com (secretária/operadora),
// ana@demo.com (dentista: só agenda)
import bcrypt from 'bcryptjs'
import { prisma } from '../src/db.ts'
import { addDias, emHorario, hojeISO, inicioDoDia } from '../src/lib/tempo.ts'

const EMAIL = 'admin@demo.com'

const dia = (n: number) => addDias(inicioDoDia(hojeISO()), n).toISOString().slice(0, 10)
const em = (n: number, hhmm: string) => emHorario(dia(n), hhmm)

async function main() {
  const existente = await prisma.usuario.findUnique({ where: { email: EMAIL } })
  if (existente) {
    console.log('Removendo dados de demonstração anteriores...')
    await prisma.clinica.delete({ where: { id: existente.clinicaId } })
  }

  const clinica = await prisma.clinica.create({
    data: {
      nome: 'Clínica Sorriso (demo)',
      tipo: 'CLINICA',
      telefone: '(51) 3333-0000',
      email: 'contato@clinicasorriso.com.br',
      horarios: {
        create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ diaSemana: d, abre: '08:00', fecha: d === 6 ? '12:00' : '19:00', ativo: d !== 0 })),
      },
    },
  })
  const clinicaId = clinica.id

  const senhaHash = await bcrypt.hash('demo1234', 10)
  const [admin, ana, recepcao] = await Promise.all([
    prisma.usuario.create({ data: { clinicaId, nome: 'Administrador', email: EMAIL, senhaHash, papel: 'ADMIN' } }),
    prisma.usuario.create({ data: { clinicaId, nome: 'Ana Souza', email: 'ana@demo.com', senhaHash, papel: 'DENTISTA' } }),
    prisma.usuario.create({ data: { clinicaId, nome: 'Paula Ribeiro', email: 'recepcao@demo.com', senhaHash, papel: 'OPERADOR' } }),
  ])

  const [p1, p2, p3] = await Promise.all([
    prisma.profissional.create({ data: { clinicaId, usuarioId: ana.id, nome: 'Dra. Ana Souza', especialidade: 'Clínico Geral', cor: '#0e7c86' } }),
    prisma.profissional.create({ data: { clinicaId, nome: 'Dr. Bruno Lima', especialidade: 'Ortodontia', cor: '#7c4dff' } }),
    prisma.profissional.create({ data: { clinicaId, nome: 'Dra. Carla Mendes', especialidade: 'Endodontia', cor: '#e8710a' } }),
  ])
  // Colaboradores que não atendem: não aparecem na agenda
  await prisma.profissional.createMany({
    data: [
      { clinicaId, usuarioId: recepcao.id, nome: 'Paula Ribeiro', funcao: 'SECRETARIO', telefone: '(51) 99111-2233', email: 'recepcao@demo.com' },
      { clinicaId, nome: 'Marcos Teixeira', funcao: 'SECRETARIO', telefone: '(51) 99444-5566' },
    ],
  })

  const procs = Object.fromEntries(
    await Promise.all(
      (
        [
          ['avaliacao', 'Avaliação / consulta inicial', 30, 150],
          ['limpeza', 'Limpeza (profilaxia)', 60, 250],
          ['fluor', 'Aplicação de flúor', 30, 90],
          ['restauracao', 'Restauração em resina', 60, 280],
          ['canal', 'Tratamento de canal (molar)', 90, 1200],
          ['extracao', 'Extração simples', 45, 300],
          ['clareamento', 'Clareamento de consultório', 60, 900],
          ['manutencao', 'Manutenção de aparelho', 30, 180],
        ] as const
      ).map(async ([k, nome, duracaoMin, valor]) => [k, await prisma.procedimento.create({ data: { clinicaId, nome, duracaoMin, valor } })] as const),
    ),
  )

  const mesAtual = hojeISO().slice(5, 7)
  const pac = async (nome: string, telefone: string, convenio: string, nascimento: string, status: 'ATIVO' | 'EM_TRATAMENTO' | 'INATIVO' = 'ATIVO') =>
    prisma.paciente.create({
      data: { clinicaId, nome, telefone, convenio, nascimento: new Date(nascimento), status, email: `${nome.split(' ')[0].toLowerCase()}@email.com` },
    })

  const mariana = await pac('Mariana Alves', '5551998123344', 'Particular', `1990-${mesAtual}-02`, 'EM_TRATAMENTO')
  const joao = await pac('João Pereira', '5551984551020', 'Bradesco Dental', '1985-03-14')
  const fernanda = await pac('Fernanda Costa', '5551991017788', 'OdontoPrev', `1978-${mesAtual}-28`, 'EM_TRATAMENTO')
  const ricardo = await pac('Ricardo Gomes', '5551988224455', 'Particular', '2001-06-21', 'INATIVO')
  const luisa = await pac('Luísa Martins', '5551993336677', 'Bradesco Dental', `1995-${mesAtual}-15`)
  const paulo = await pac('Paulo Henrique', '5551981002233', 'Amil Dental', '1969-12-11')
  const beatriz = await pac('Beatriz Rocha', '5551996541122', 'Particular', '2010-04-18')
  const gustavo = await pac('Gustavo Nunes', '5551987779900', 'OdontoPrev', '1988-01-09', 'EM_TRATAMENTO')

  type StatusSeed = 'AGENDADA' | 'CONFIRMADA' | 'EM_ATENDIMENTO' | 'CONCLUIDA' | 'FALTOU' | 'CANCELADA'
  const c = (pacienteId: string, profissionalId: string, proc: keyof typeof procs, d: number, inicio: string, status: StatusSeed = 'AGENDADA') => {
    const p = procs[proc]
    const ini = em(d, inicio)
    return { clinicaId, pacienteId, profissionalId, procedimentoId: p.id, inicio: ini, fim: new Date(ini.getTime() + p.duracaoMin * 60_000), valor: p.valor, status }
  }

  await prisma.consulta.createMany({
    data: [
      // Histórico
      c(ricardo.id, p1.id, 'limpeza', -220, '10:00', 'CONCLUIDA'),
      c(beatriz.id, p1.id, 'avaliacao', -40, '09:00', 'CONCLUIDA'),
      c(joao.id, p1.id, 'limpeza', -35, '14:00', 'CONCLUIDA'),
      c(gustavo.id, p2.id, 'manutencao', -25, '08:30', 'CONCLUIDA'),
      c(mariana.id, p1.id, 'restauracao', -12, '10:00', 'CONCLUIDA'),
      c(luisa.id, p1.id, 'clareamento', -7, '13:00', 'CONCLUIDA'),
      c(fernanda.id, p3.id, 'canal', -3, '14:00', 'CONCLUIDA'),
      // Hoje
      c(mariana.id, p1.id, 'restauracao', 0, '08:00', 'CONCLUIDA'),
      c(fernanda.id, p3.id, 'canal', 0, '09:00', 'EM_ATENDIMENTO'),
      c(luisa.id, p1.id, 'avaliacao', 0, '10:00', 'CONFIRMADA'),
      c(gustavo.id, p2.id, 'manutencao', 0, '11:00', 'CONFIRMADA'),
      c(joao.id, p1.id, 'limpeza', 0, '14:00'),
      c(paulo.id, p2.id, 'avaliacao', 0, '15:00'),
      c(beatriz.id, p1.id, 'fluor', 0, '16:30', 'FALTOU'),
      // Próximos dias
      c(ricardo.id, p3.id, 'avaliacao', 1, '09:00'),
      c(mariana.id, p1.id, 'restauracao', 1, '10:00', 'CONFIRMADA'),
      c(fernanda.id, p3.id, 'canal', 2, '14:00'),
      c(gustavo.id, p2.id, 'manutencao', 3, '08:30'),
    ],
  })

  // Movimento gerado (dashboard financeiro, histórico de pacientes): ~6 meses para trás e 3 semanas para frente.
  // Só nos horários 11h, 16h, 17h e 18h, que não cruzam as consultas fixas acima. Sementes fixas: o seed é reproduzível.
  let semente = 42
  const rand = () => {
    semente = (semente * 1103515245 + 12345) % 2147483648
    return semente / 2147483648
  }
  const escolher = <X,>(xs: readonly X[]) => xs[Math.floor(rand() * xs.length)]
  const procsPorDentista: Record<string, (keyof typeof procs)[]> = {
    [p1.id]: ['limpeza', 'restauracao', 'avaliacao', 'fluor', 'extracao', 'clareamento'],
    [p2.id]: ['manutencao', 'manutencao', 'avaliacao'],
    [p3.id]: ['avaliacao', 'restauracao', 'canal'],
  }
  // Ricardo fica de fora: é o exemplo de paciente sem retorno
  const pacientesGerados = [mariana, joao, fernanda, luisa, paulo, beatriz, gustavo]
  const gerados: ReturnType<typeof c>[] = []
  for (let d = -182; d <= 21; d++) {
    if (d === 0) continue
    const diaSemana = em(d, '12:00').getUTCDay()
    if (diaSemana === 0) continue
    const horas = diaSemana === 6 ? ['11:00'] : ['11:00', '16:00', '17:00', '18:00']
    for (const prof of [p1, p2, p3]) {
      for (const hora of horas) {
        if (rand() > (d < 0 ? 0.45 : 0.3)) continue
        let proc = escolher(procsPorDentista[prof.id])
        if (procs[proc].duracaoMin > 60 && hora !== '18:00') proc = 'avaliacao' // canal (90 min) só no último horário
        const r = rand()
        const status: StatusSeed = d < 0 ? (r < 0.08 ? 'FALTOU' : r < 0.12 ? 'CANCELADA' : 'CONCLUIDA') : d <= 2 && r < 0.5 ? 'CONFIRMADA' : 'AGENDADA'
        gerados.push(c(escolher(pacientesGerados).id, prof.id, proc, d, hora, status))
      }
    }
  }
  await prisma.consulta.createMany({ data: gerados })


  // Avaliações pós-consulta: ~60% das consultas realizadas, com leve diferença entre dentistas
  const vies: Record<string, number> = { [p1.id]: 0.12, [p2.id]: -0.1, [p3.id]: 0 }
  const COMENTARIOS: Record<number, string[]> = {
    5: [
      'Atendimento excelente, recomendo!',
      'Muito cuidado e atenção, não senti nada.',
      'Explicou todo o tratamento com calma.',
      'Pontualidade e simpatia, nota 10.',
      'Consultório impecável e equipe ótima.',
    ],
    4: ['Bom atendimento, só atrasou um pouco.', 'Gostei, voltarei.', 'Tudo certo, recepção poderia ser mais ágil.'],
    3: ['Esperei bastante na recepção.', 'Atendimento ok, mas achei o valor alto.'],
    2: ['Atrasou 40 minutos e ninguém avisou.', 'Senti dor e não fui avisado antes do procedimento.'],
    1: ['Fui mal atendido na recepção e o horário não foi respeitado.'],
  }
  const realizadas = await prisma.consulta.findMany({
    where: { clinicaId, status: 'CONCLUIDA' },
    select: { id: true, profissionalId: true, fim: true },
    orderBy: { inicio: 'asc' },
  })
  const avaliacoes = realizadas
    .filter(() => rand() < 0.6)
    .map((c) => {
      const r = rand() + (vies[c.profissionalId] ?? 0)
      const nota = r > 0.45 ? 5 : r > 0.18 ? 4 : r > 0.07 ? 3 : r > 0.02 ? 2 : 1
      return {
        clinicaId,
        consultaId: c.id,
        nota,
        comentario: rand() < 0.5 || nota <= 2 ? escolher(COMENTARIOS[nota]) : null,
        criadoEm: new Date(c.fim.getTime() + 3 * 3_600_000),
      }
    })
  await prisma.avaliacao.createMany({ data: avaliacoes })
  console.log(`Avaliações geradas: ${avaliacoes.length}`)

  // Cadastro antigo para a maioria; Paulo e Beatriz contam como novos no mês
  await prisma.paciente.updateMany({
    where: { clinicaId, id: { notIn: [paulo.id, beatriz.id] } },
    data: { criadoEm: em(-240, '09:00') },
  })

  const agora = new Date()
  const minAtras = (m: number) => new Date(agora.getTime() - m * 60_000)
  const conversa = (telefone: string, pacienteId: string | null, nomeContato: string | null, naoLidas: number, msgs: [de: 'PACIENTE' | 'CLINICA', texto: string, minutos: number][]) =>
    prisma.conversa.create({
      data: {
        clinicaId, telefone, pacienteId, nomeContato, naoLidas,
        ultimaMensagemEm: minAtras(msgs[msgs.length - 1][2]),
        mensagens: { create: msgs.map(([de, texto, m]) => ({ de, texto, enviadaEm: minAtras(m) })) },
      },
    })

  await conversa(joao.telefone, joao.id, null, 1, [
    ['CLINICA', 'Olá João! Lembrando da sua limpeza hoje às 14:00 com a Dra. Ana. Confirma? Responda SIM ou NÃO.', 120],
    ['PACIENTE', 'Confirmo sim, obrigado!', 20],
  ])
  await conversa('5551992004411', null, null, 2, [
    ['PACIENTE', 'Bom dia!', 46],
    ['PACIENTE', 'Vocês atendem implante? Quanto custa uma avaliação?', 45],
  ])
  await conversa(beatriz.telefone, beatriz.id, null, 1, [
    ['CLINICA', 'Oi Beatriz, sentimos sua falta hoje! Gostaria de remarcar?', 60 * 20],
    ['PACIENTE', 'Posso remarcar para semana que vem?', 60 * 19],
  ])
  await conversa(mariana.telefone, mariana.id, null, 0, [
    ['CLINICA', 'Mariana, sua próxima sessão ficou para amanhã às 10:00.', 60 * 48],
    ['PACIENTE', 'Perfeito, até lá!', 60 * 47],
  ])

  console.log(`Consultas geradas: ${gerados.length}`)
  console.log(`Seed concluído. Clínica ${clinica.nome} — login: ${admin.email} / demo1234`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
