import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar } from '../auth.ts'
import { prisma } from '../db.ts'
import { addDias, hojeISO, inicioDoDia } from '../lib/tempo.ts'

const inicioDoMes = (data: string, deslocamento = 0) => {
  const [a, m] = data.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + deslocamento, 1))
  return inicioDoDia(d.toISOString().slice(0, 10))
}

export default async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)

  app.get('/', async (req) => {
    const { data } = z.object({ data: z.iso.date().default(hojeISO) }).parse(req.query)
    const clinicaId = req.user.clinicaId
    const dia = inicioDoDia(data)
    const mes = inicioDoMes(data)
    const proximoMes = inicioDoMes(data, 1)
    const mesAnterior = inicioDoMes(data, -1)
    const seisMesesAtras = inicioDoMes(data, -6)

    const faturamento = (de: Date, ate: Date) =>
      prisma.consulta.aggregate({ where: { clinicaId, status: 'CONCLUIDA', inicio: { gte: de, lt: ate } }, _sum: { valor: true } })

    const [agendaHoje, fatMes, fatAnterior, novosPacientes, naoLidas, semRetorno, aniversariantes] = await Promise.all([
      prisma.consulta.findMany({
        where: { clinicaId, inicio: { gte: dia, lt: addDias(dia, 1) } },
        orderBy: { inicio: 'asc' },
        include: {
          paciente: { select: { id: true, nome: true } },
          profissional: { select: { id: true, nome: true, cor: true } },
          procedimento: { select: { id: true, nome: true } },
        },
      }),
      faturamento(mes, proximoMes),
      faturamento(mesAnterior, mes),
      prisma.paciente.count({ where: { clinicaId, criadoEm: { gte: mes, lt: proximoMes } } }),
      prisma.conversa.aggregate({ where: { clinicaId }, _sum: { naoLidas: true } }),
      // Pacientes com histórico, mas sem nenhuma consulta nos últimos 6 meses
      prisma.paciente.count({
        where: { clinicaId, consultas: { some: {}, none: { inicio: { gte: seisMesesAtras } } } },
      }),
      prisma.$queryRaw<{ id: string; nome: string; telefone: string; nascimento: Date }[]>`
        SELECT id, nome, telefone, nascimento FROM "Paciente"
        WHERE "clinicaId" = ${clinicaId} AND EXTRACT(MONTH FROM nascimento) = ${Number(data.slice(5, 7))}
        ORDER BY EXTRACT(DAY FROM nascimento)`,
    ])

    const confirmadas = agendaHoje.filter((c) => ['CONFIRMADA', 'EM_ATENDIMENTO', 'CONCLUIDA'].includes(c.status)).length
    const mesAtual = Number(fatMes._sum.valor ?? 0)
    const anterior = Number(fatAnterior._sum.valor ?? 0)

    return {
      data,
      consultasHoje: agendaHoje.length,
      confirmadasHoje: confirmadas,
      faltasHoje: agendaHoje.filter((c) => c.status === 'FALTOU').length,
      taxaConfirmacao: agendaHoje.length ? confirmadas / agendaHoje.length : 0,
      faturamentoMes: mesAtual,
      faturamentoMesAnterior: anterior,
      variacaoFaturamento: anterior ? (mesAtual - anterior) / anterior : null,
      novosPacientesMes: novosPacientes,
      mensagensNaoLidas: naoLidas._sum.naoLidas ?? 0,
      pacientesSemRetorno: semRetorno,
      agendaHoje,
      aniversariantes,
    }
  })
}
