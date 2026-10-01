// Dados de demonstração: npm run db:seed
// Login: admin@demo.com / demo1234
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
  const [admin, ana] = await Promise.all([
    prisma.usuario.create({ data: { clinicaId, nome: 'Administrador', email: EMAIL, senhaHash, papel: 'ADMIN' } }),
    prisma.usuario.create({ data: { clinicaId, nome: 'Ana Souza', email: 'ana@demo.com', senhaHash, papel: 'DENTISTA' } }),
    prisma.usuario.create({ data: { clinicaId, nome: 'Recepção', email: 'recepcao@demo.com', senhaHash, papel: 'RECEPCAO' } }),
  ])

  const [p1, p2, p3] = await Promise.all([
    prisma.profissional.create({ data: { clinicaId, usuarioId: ana.id, nome: 'Dra. Ana Souza', especialidade: 'Clínico Geral', cor: '#0e7c86' } }),
    prisma.profissional.create({ data: { clinicaId, nome: 'Dr. Bruno Lima', especialidade: 'Ortodontia', cor: '#7c4dff' } }),
    prisma.profissional.create({ data: { clinicaId, nome: 'Dra. Carla Mendes', especialidade: 'Endodontia', cor: '#e8710a' } }),
  ])

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

  const c = (pacienteId: string, profissionalId: string, proc: keyof typeof procs, d: number, inicio: string, status: 'AGENDADA' | 'CONFIRMADA' | 'EM_ATENDIMENTO' | 'CONCLUIDA' | 'FALTOU' = 'AGENDADA') => {
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

  console.log(`Seed concluído. Clínica ${clinica.nome} — login: ${admin.email} / demo1234`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
