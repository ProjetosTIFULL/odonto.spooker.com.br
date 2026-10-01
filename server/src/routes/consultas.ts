import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar } from '../auth.ts'
import { prisma } from '../db.ts'
import { HttpError, idParams, naoEncontrado } from '../lib/http.ts'
import { addDias, emHorario, hojeISO, inicioDoDia } from '../lib/tempo.ts'

const STATUS = ['AGENDADA', 'CONFIRMADA', 'EM_ATENDIMENTO', 'CONCLUIDA', 'FALTOU', 'CANCELADA'] as const
/** Status que ocupam o horário na agenda. */
const OCUPAM = ['AGENDADA', 'CONFIRMADA', 'EM_ATENDIMENTO', 'CONCLUIDA'] as const

const criarBody = z.object({
  pacienteId: z.uuid(),
  profissionalId: z.uuid(),
  procedimentoId: z.uuid().nullish(),
  inicio: z.coerce.date(),
  fim: z.coerce.date().optional(), // se omitido, usa a duração do procedimento (ou 30 min)
  valor: z.number().nonnegative().nullish(), // se omitido, usa o valor do procedimento
  observacoes: z.string().nullish(),
})

const atualizarBody = criarBody.partial().extend({ status: z.enum(STATUS).optional() })

const listQuery = z.object({
  de: z.iso.date().default(hojeISO), // YYYY-MM-DD, inclusivo
  ate: z.iso.date().optional(), // YYYY-MM-DD, inclusivo (padrão: 7 dias após "de")
  profissionalId: z.uuid().optional(),
  pacienteId: z.uuid().optional(),
  status: z.enum(STATUS).optional(),
})

const livresQuery = z.object({
  data: z.iso.date(),
  profissionalId: z.uuid(),
  duracaoMin: z.coerce.number().int().min(5).max(600).default(30),
  intervaloMin: z.coerce.number().int().min(5).max(120).default(30),
})

const incluir = {
  paciente: { select: { id: true, nome: true, telefone: true } },
  profissional: { select: { id: true, nome: true, cor: true } },
  procedimento: { select: { id: true, nome: true } },
} as const

export default async function consultasRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)

  /** Garante que os IDs referenciados pertencem à clínica do usuário. */
  async function validarRefs(clinicaId: string, r: { pacienteId?: string; profissionalId?: string; procedimentoId?: string | null }) {
    const [pac, prof, proc] = await Promise.all([
      r.pacienteId ? prisma.paciente.findFirst({ where: { id: r.pacienteId, clinicaId } }) : true,
      r.profissionalId ? prisma.profissional.findFirst({ where: { id: r.profissionalId, clinicaId, ativo: true } }) : true,
      r.procedimentoId ? prisma.procedimento.findFirst({ where: { id: r.procedimentoId, clinicaId } }) : null,
    ])
    if (!pac) throw naoEncontrado('Paciente')
    if (!prof) throw naoEncontrado('Profissional')
    if (r.procedimentoId && !proc) throw naoEncontrado('Procedimento')
    return proc
  }

  async function verificarConflito(profissionalId: string, inicio: Date, fim: Date, ignorarId?: string) {
    if (fim <= inicio) throw new HttpError(400, 'O fim da consulta deve ser depois do início')
    const conflito = await prisma.consulta.findFirst({
      where: {
        profissionalId,
        status: { in: [...OCUPAM] },
        inicio: { lt: fim },
        fim: { gt: inicio },
        ...(ignorarId && { id: { not: ignorarId } }),
      },
      include: { paciente: { select: { nome: true } } },
    })
    if (conflito) {
      throw new HttpError(409, `Conflito com a consulta de ${conflito.paciente.nome} (${conflito.inicio.toISOString()})`)
    }
  }

  app.get('/', async (req) => {
    const q = listQuery.parse(req.query)
    const de = inicioDoDia(q.de)
    const ate = q.ate ? addDias(inicioDoDia(q.ate), 1) : addDias(de, 7)
    return prisma.consulta.findMany({
      where: {
        clinicaId: req.user.clinicaId,
        inicio: { gte: de, lt: ate },
        ...(q.profissionalId && { profissionalId: q.profissionalId }),
        ...(q.pacienteId && { pacienteId: q.pacienteId }),
        ...(q.status && { status: q.status }),
      },
      orderBy: { inicio: 'asc' },
      include: incluir,
    })
  })

  /** Horários livres de um profissional num dia, respeitando o horário de atendimento. */
  app.get('/horarios-livres', async (req) => {
    const { data, profissionalId, duracaoMin, intervaloMin } = livresQuery.parse(req.query)
    const clinicaId = req.user.clinicaId
    const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay()

    const horario = await prisma.horarioAtendimento.findUnique({ where: { clinicaId_diaSemana: { clinicaId, diaSemana } } })
    if (!horario?.ativo) return []

    const ocupadas = await prisma.consulta.findMany({
      where: { clinicaId, profissionalId, status: { in: [...OCUPAM] }, inicio: { lt: emHorario(data, horario.fecha) }, fim: { gt: emHorario(data, horario.abre) } },
      select: { inicio: true, fim: true },
    })

    const livres: { inicio: Date; fim: Date }[] = []
    const agora = new Date()
    const fechamento = emHorario(data, horario.fecha).getTime()
    for (let t = emHorario(data, horario.abre).getTime(); t + duracaoMin * 60_000 <= fechamento; t += intervaloMin * 60_000) {
      const inicio = new Date(t)
      const fim = new Date(t + duracaoMin * 60_000)
      if (inicio < agora) continue
      if (ocupadas.some((c) => c.inicio < fim && c.fim > inicio)) continue
      livres.push({ inicio, fim })
    }
    return livres
  })

  app.get('/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    const c = await prisma.consulta.findFirst({ where: { id, clinicaId: req.user.clinicaId }, include: incluir })
    if (!c) throw naoEncontrado('Consulta')
    return c
  })

  app.post('/', async (req, reply) => {
    const d = criarBody.parse(req.body)
    const clinicaId = req.user.clinicaId
    const proc = await validarRefs(clinicaId, d)
    if (d.inicio < new Date()) throw new HttpError(400, 'Não é possível agendar em um horário que já passou')
    const fim = d.fim ?? new Date(d.inicio.getTime() + (proc?.duracaoMin ?? 30) * 60_000)
    await verificarConflito(d.profissionalId, d.inicio, fim)

    const criada = await prisma.consulta.create({
      data: { ...d, fim, clinicaId, valor: d.valor ?? proc?.valor ?? null },
      include: incluir,
    })
    return reply.code(201).send(criada)
  })

  app.put('/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    const d = atualizarBody.parse(req.body)
    const clinicaId = req.user.clinicaId
    const atual = await prisma.consulta.findFirst({ where: { id, clinicaId } })
    if (!atual) throw naoEncontrado('Consulta')

    await validarRefs(clinicaId, d)
    // Remarcar (horário ou profissional) só vale para consultas que ainda não começaram e para um horário futuro.
    // Mudar status, valor ou observações de consultas passadas continua permitido.
    const remarcando =
      (d.inicio && d.inicio.getTime() !== atual.inicio.getTime()) ||
      (d.fim && d.fim.getTime() !== atual.fim.getTime()) ||
      (d.profissionalId && d.profissionalId !== atual.profissionalId)
    if (remarcando) {
      const agora = new Date()
      if (atual.inicio <= agora) throw new HttpError(400, 'Esta consulta já começou e não pode ser remarcada')
      if (d.inicio && d.inicio < agora) throw new HttpError(400, 'Não é possível remarcar para um horário que já passou')
      if (!['AGENDADA', 'CONFIRMADA'].includes(atual.status)) throw new HttpError(400, 'Só consultas agendadas ou confirmadas podem ser remarcadas')
    }
    const inicio = d.inicio ?? atual.inicio
    const fim = d.fim ?? (d.inicio ? new Date(inicio.getTime() + (atual.fim.getTime() - atual.inicio.getTime())) : atual.fim)
    const status = d.status ?? atual.status
    if ((OCUPAM as readonly string[]).includes(status)) {
      await verificarConflito(d.profissionalId ?? atual.profissionalId, inicio, fim, id)
    }

    return prisma.consulta.update({ where: { id }, data: { ...d, inicio, fim }, include: incluir })
  })

  app.patch('/:id/status', async (req) => {
    const { id } = idParams.parse(req.params)
    const { status } = z.object({ status: z.enum(STATUS) }).parse(req.body)
    const { count } = await prisma.consulta.updateMany({ where: { id, clinicaId: req.user.clinicaId }, data: { status } })
    if (!count) throw naoEncontrado('Consulta')
    return prisma.consulta.findUniqueOrThrow({ where: { id }, include: incluir })
  })

  app.delete('/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const { count } = await prisma.consulta.deleteMany({ where: { id, clinicaId: req.user.clinicaId } })
    if (!count) throw naoEncontrado('Consulta')
    return reply.code(204).send()
  })
}
