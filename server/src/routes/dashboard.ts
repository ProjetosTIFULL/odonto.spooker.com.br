// Dashboard em três partes:
// - /rotina: o dia a dia da recepção (ADMIN e OPERADOR). Não traz nenhum valor em dinheiro.
// - /financeiro: faturamento, previsão, perdas e rankings (somente ADMIN).
// - /desempenho: atendimentos, comparecimento e notas pós-consulta por dentista (somente ADMIN).

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar, EQUIPE_ATENDIMENTO, exigirPapel } from '../auth.ts'
import { prisma } from '../db.ts'
import { addDias, hojeISO, inicioDoDia } from '../lib/tempo.ts'

const inicioDoMes = (data: string, deslocamento = 0) => {
  const [a, m] = data.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + deslocamento, 1))
  return inicioDoDia(d.toISOString().slice(0, 10))
}
const mesISO = (data: string, deslocamento = 0) => {
  const [a, m] = data.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1 + deslocamento, 1)).toISOString().slice(0, 7)
}

const query = z.object({ data: z.iso.date().default(hojeISO) })

const resumoConsulta = {
  paciente: { select: { id: true, nome: true, telefone: true } },
  profissional: { select: { id: true, nome: true, cor: true } },
  procedimento: { select: { id: true, nome: true } },
} as const

const PENDENTES = ['AGENDADA', 'CONFIRMADA'] as const

export default async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)

  app.get('/rotina', { preHandler: exigirPapel(...EQUIPE_ATENDIMENTO) }, async (req) => {
    const { data } = query.parse(req.query)
    const clinicaId = req.user.clinicaId
    const dia = inicioDoDia(data)
    const amanha = addDias(dia, 1)
    const mes = inicioDoMes(data)
    const agora = new Date()

    // Sem valor em dinheiro: o select de consulta não inclui "valor"
    const consultaSelect = { id: true, inicio: true, fim: true, status: true, ...resumoConsulta } as const

    const [agendaHoje, aConfirmarAmanha, pendentesBaixa, semRetorno, novosPacientes, aniversariantes] = await Promise.all([
      prisma.consulta.findMany({ where: { clinicaId, inicio: { gte: dia, lt: amanha } }, orderBy: { inicio: 'asc' }, select: consultaSelect }),
      prisma.consulta.findMany({
        where: { clinicaId, status: 'AGENDADA', inicio: { gte: amanha, lt: addDias(amanha, 1) } },
        orderBy: { inicio: 'asc' },
        select: consultaSelect,
      }),
      // Horário já passou (últimos 7 dias) e ninguém marcou concluída / faltou
      prisma.consulta.findMany({
        where: { clinicaId, status: { in: [...PENDENTES] }, inicio: { gte: addDias(dia, -7), lt: agora } },
        orderBy: { inicio: 'asc' },
        select: consultaSelect,
      }),
      prisma.paciente.count({ where: { clinicaId, consultas: { some: {}, none: { inicio: { gte: inicioDoMes(data, -6) } } } } }),
      prisma.paciente.count({ where: { clinicaId, criadoEm: { gte: mes } } }),
      prisma.$queryRaw<{ id: string; nome: string; telefone: string; nascimento: Date }[]>`
        SELECT id, nome, telefone, nascimento FROM "Paciente"
        WHERE "clinicaId" = ${clinicaId} AND EXTRACT(MONTH FROM nascimento) = ${Number(data.slice(5, 7))}
        ORDER BY EXTRACT(DAY FROM nascimento)`,
    ])

    const confirmadas = agendaHoje.filter((c) => ['CONFIRMADA', 'EM_ATENDIMENTO', 'CONCLUIDA'].includes(c.status)).length
    const validas = agendaHoje.filter((c) => c.status !== 'CANCELADA' && c.status !== 'REMARCADA').length

    return {
      data,
      consultasHoje: validas,
      confirmadasHoje: confirmadas,
      faltasHoje: agendaHoje.filter((c) => c.status === 'FALTOU').length,
      taxaConfirmacao: validas ? confirmadas / validas : 0,
      pacientesSemRetorno: semRetorno,
      novosPacientesMes: novosPacientes,
      agendaHoje,
      aConfirmarAmanha,
      pendentesBaixa,
      aniversariantes,
    }
  })

  app.get('/financeiro', { preHandler: exigirPapel('ADMIN') }, async (req) => {
    const { data } = query.parse(req.query)
    const clinicaId = req.user.clinicaId
    const mes = inicioDoMes(data)
    const proximoMes = inicioDoMes(data, 1)
    const mesAnterior = inicioDoMes(data, -1)
    const seisMeses = inicioDoMes(data, -5)
    const agora = new Date()

    const soma = (status: 'CONCLUIDA' | 'FALTOU', de: Date, ate: Date) =>
      prisma.consulta.aggregate({ where: { clinicaId, status, inicio: { gte: de, lt: ate } }, _sum: { valor: true }, _count: true })

    // Comparação justa no meio do mês: mês anterior até o mesmo dia (1º a 1º, 1º a 15...)
    const diasCorridos = Math.round((addDias(inicioDoDia(data), 1).getTime() - mes.getTime()) / 86_400_000)
    const mesmoPeriodoAnterior = new Date(Math.min(addDias(mesAnterior, diasCorridos).getTime(), mes.getTime()))

    const [realizado, anterior, anteriorMesmoPeriodo, faltas, previsto, historico, porProf, porProc] = await Promise.all([
      soma('CONCLUIDA', mes, proximoMes),
      soma('CONCLUIDA', mesAnterior, mes),
      soma('CONCLUIDA', mesAnterior, mesmoPeriodoAnterior),
      soma('FALTOU', mes, proximoMes),
      // Ainda vai acontecer neste mês
      prisma.consulta.aggregate({
        where: { clinicaId, status: { in: [...PENDENTES] }, inicio: { gte: agora, lt: proximoMes } },
        _sum: { valor: true },
        _count: true,
      }),
      prisma.$queryRaw<{ mes: string; valor: string | null; consultas: bigint }[]>`
        SELECT to_char(date_trunc('month', (inicio AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS mes,
               SUM(valor) AS valor, COUNT(*) AS consultas
        FROM "Consulta"
        WHERE "clinicaId" = ${clinicaId} AND status = 'CONCLUIDA' AND inicio >= ${seisMeses} AND inicio < ${proximoMes}
        GROUP BY 1`,
      prisma.consulta.groupBy({
        by: ['profissionalId'],
        where: { clinicaId, status: 'CONCLUIDA', inicio: { gte: mes, lt: proximoMes } },
        _sum: { valor: true },
        _count: true,
      }),
      prisma.consulta.groupBy({
        by: ['procedimentoId'],
        where: { clinicaId, status: 'CONCLUIDA', inicio: { gte: mes, lt: proximoMes } },
        _sum: { valor: true },
        _count: true,
      }),
    ])

    const [profs, procs] = await Promise.all([
      prisma.profissional.findMany({ where: { clinicaId, funcao: 'DENTISTA' }, select: { id: true, nome: true, cor: true, ativo: true } }),
      prisma.procedimento.findMany({ where: { clinicaId }, select: { id: true, nome: true } }),
    ])

    const n = (v: unknown) => Number(v ?? 0)
    const realizadoMes = n(realizado._sum.valor)
    const realizadoAnterior = n(anterior._sum.valor)
    const realizadoAnteriorPeriodo = n(anteriorMesmoPeriodo._sum.valor)
    const porMes = new Map(historico.map((h) => [h.mes, h]))

    return {
      data,
      realizadoMes,
      consultasConcluidasMes: realizado._count,
      realizadoMesAnterior: realizadoAnterior,
      diasCorridos,
      realizadoMesAnteriorMesmoPeriodo: realizadoAnteriorPeriodo,
      variacaoMesmoPeriodo: realizadoAnteriorPeriodo ? (realizadoMes - realizadoAnteriorPeriodo) / realizadoAnteriorPeriodo : null,
      previstoRestanteMes: n(previsto._sum.valor),
      consultasPrevistasMes: previsto._count,
      ticketMedio: realizado._count ? realizadoMes / realizado._count : 0,
      perdaFaltasMes: n(faltas._sum.valor),
      faltasMes: faltas._count,
      // Sempre 6 meses, inclusive os sem movimento
      ultimosMeses: Array.from({ length: 6 }, (_, i) => {
        const m = mesISO(data, i - 5)
        const h = porMes.get(m)
        return { mes: m, valor: n(h?.valor), consultas: Number(h?.consultas ?? 0) }
      }),
      // Profissionais ativos aparecem mesmo zerados; inativos só se faturaram no mês
      porProfissional: profs
        .map((p) => {
          const g = porProf.find((x) => x.profissionalId === p.id)
          return { id: p.id, nome: p.nome, cor: p.cor, valor: n(g?._sum.valor), consultas: g?._count ?? 0, ativo: p.ativo }
        })
        .filter((p) => p.ativo || p.consultas > 0)
        .map(({ ativo: _ativo, ...p }) => p)
        .sort((a, b) => b.valor - a.valor),
      porProcedimento: porProc
        .map((g) => ({
          id: g.procedimentoId,
          nome: procs.find((p) => p.id === g.procedimentoId)?.nome ?? 'Sem procedimento',
          valor: n(g._sum.valor),
          consultas: g._count,
        }))
        .sort((a, b) => b.valor - a.valor),
    }
  })

  /**
   * Desempenho dos dentistas num período móvel (30, 90 ou 180 dias até agora), pela data da consulta.
   * Sem valores em dinheiro: isso fica no /financeiro.
   */
  app.get('/desempenho', { preHandler: exigirPapel('ADMIN') }, async (req) => {
    const { dias } = z.object({ dias: z.coerce.number().pipe(z.union([z.literal(30), z.literal(90), z.literal(180)])).default(30) }).parse(req.query)
    const clinicaId = req.user.clinicaId
    const ate = new Date()
    const de = addDias(ate, -dias)

    const [porStatus, notas, distribuicao, topProcDentista, porProcedimento, dentistas, melhores, atencao] = await Promise.all([
      prisma.consulta.groupBy({
        by: ['profissionalId', 'status'],
        where: { clinicaId, inicio: { gte: de, lt: ate } },
        _count: true,
      }),
      prisma.$queryRaw<{ profissionalId: string; media: number; qtd: number }[]>`
        SELECT c."profissionalId", AVG(a.nota)::float AS media, COUNT(*)::int AS qtd
        FROM "Avaliacao" a JOIN "Consulta" c ON c.id = a."consultaId"
        WHERE a."clinicaId" = ${clinicaId} AND c.inicio >= ${de} AND c.inicio < ${ate}
        GROUP BY 1`,
      prisma.$queryRaw<{ profissionalId: string; nota: number; qtd: number }[]>`
        SELECT c."profissionalId", a.nota, COUNT(*)::int AS qtd
        FROM "Avaliacao" a JOIN "Consulta" c ON c.id = a."consultaId"
        WHERE a."clinicaId" = ${clinicaId} AND c.inicio >= ${de} AND c.inicio < ${ate}
        GROUP BY 1, 2`,
      // Procedimento mais realizado por dentista
      prisma.$queryRaw<{ profissionalId: string; nome: string; qtd: number }[]>`
        SELECT DISTINCT ON (c."profissionalId") c."profissionalId", p.nome, COUNT(*)::int AS qtd
        FROM "Consulta" c JOIN "Procedimento" p ON p.id = c."procedimentoId"
        WHERE c."clinicaId" = ${clinicaId} AND c.status = 'CONCLUIDA' AND c.inicio >= ${de} AND c.inicio < ${ate}
        GROUP BY c."profissionalId", p.nome
        ORDER BY c."profissionalId", COUNT(*) DESC, p.nome`,
      prisma.$queryRaw<{ id: string; nome: string; qtd: number; media: number | null; avaliacoes: number }[]>`
        SELECT p.id, p.nome, COUNT(c.id)::int AS qtd, AVG(a.nota)::float AS media, COUNT(a.id)::int AS avaliacoes
        FROM "Consulta" c
        JOIN "Procedimento" p ON p.id = c."procedimentoId"
        LEFT JOIN "Avaliacao" a ON a."consultaId" = c.id
        WHERE c."clinicaId" = ${clinicaId} AND c.status = 'CONCLUIDA' AND c.inicio >= ${de} AND c.inicio < ${ate}
        GROUP BY p.id, p.nome
        ORDER BY qtd DESC, p.nome`,
      prisma.profissional.findMany({
        where: { clinicaId, funcao: 'DENTISTA' },
        select: { id: true, nome: true, cor: true, especialidade: true, ativo: true },
        orderBy: { nome: 'asc' },
      }),
      ...[{ nota: 5 }, { nota: { lte: 3 } }].map((filtroNota) =>
        prisma.avaliacao.findMany({
          where: { clinicaId, ...filtroNota, comentario: { not: null }, consulta: { inicio: { gte: de, lt: ate } } },
          orderBy: { consulta: { inicio: 'desc' } },
          take: 5,
          select: {
            id: true,
            nota: true,
            comentario: true,
            consulta: { select: { inicio: true, ...resumoConsulta } },
          },
        }),
      ),
    ])

    const contar = (profId: string | null, status: string) =>
      porStatus.filter((g) => (profId === null || g.profissionalId === profId) && g.status === status).reduce((s, g) => s + g._count, 0)
    const comparecimento = (realizadas: number, faltas: number) => (realizadas + faltas ? realizadas / (realizadas + faltas) : null)

    const realizadasTotal = contar(null, 'CONCLUIDA')
    const faltasTotal = contar(null, 'FALTOU')
    const avaliacoesTotal = notas.reduce((s, n) => s + n.qtd, 0)
    const somaNotas = notas.reduce((s, n) => s + n.media * n.qtd, 0)

    const porDentista = dentistas
      .map((d) => {
        const realizadas = contar(d.id, 'CONCLUIDA')
        const faltas = contar(d.id, 'FALTOU')
        const n = notas.find((x) => x.profissionalId === d.id)
        return {
          id: d.id,
          nome: d.nome,
          cor: d.cor,
          especialidade: d.especialidade,
          ativo: d.ativo,
          atendimentos: realizadas,
          faltas,
          remarcadas: contar(d.id, 'REMARCADA'),
          canceladas: contar(d.id, 'CANCELADA'),
          comparecimento: comparecimento(realizadas, faltas),
          notaMedia: n?.media ?? null,
          avaliacoes: n?.qtd ?? 0,
          // quantidade de notas 1..5
          distribuicao: [1, 2, 3, 4, 5].map((nota) => distribuicao.find((x) => x.profissionalId === d.id && x.nota === nota)?.qtd ?? 0),
          procedimentoMaisFeito: topProcDentista.find((x) => x.profissionalId === d.id) ?? null,
        }
      })
      // Inativos só aparecem se atenderam no período
      .filter((d) => d.ativo || d.atendimentos > 0)
      .sort((a, b) => b.atendimentos - a.atendimentos)

    const formatarAvaliacao = (a: (typeof melhores)[number]) => ({
      id: a.id,
      nota: a.nota,
      comentario: a.comentario,
      data: a.consulta.inicio,
      paciente: a.consulta.paciente.nome,
      dentista: a.consulta.profissional.nome,
      cor: a.consulta.profissional.cor,
      procedimento: a.consulta.procedimento?.nome ?? 'Consulta',
    })

    return {
      dias,
      de,
      ate,
      atendimentos: realizadasTotal,
      faltas: faltasTotal,
      comparecimento: comparecimento(realizadasTotal, faltasTotal),
      notaMedia: avaliacoesTotal ? somaNotas / avaliacoesTotal : null,
      avaliacoes: avaliacoesTotal,
      taxaResposta: realizadasTotal ? avaliacoesTotal / realizadasTotal : null,
      porDentista,
      procedimentos: porProcedimento.map((p) => ({ ...p, media: p.media ?? null })),
      melhoresAvaliacoes: melhores.map(formatarAvaliacao),
      pontosDeAtencao: atencao.map(formatarAvaliacao),
    }
  })
}
