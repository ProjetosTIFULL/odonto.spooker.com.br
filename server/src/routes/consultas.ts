import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { agendaRestrita, autenticar } from '../auth.ts'
import { prisma } from '../db.ts'
import { HttpError, idParams, naoEncontrado } from '../lib/http.ts'
import { addDias, emHorario, fmtDataHora, hojeISO, inicioDoDia } from '../lib/tempo.ts'

/** Status que podem ser definidos diretamente. REMARCADA só via POST /:id/remarcar (que cria a nova consulta). */
const STATUS = ['AGENDADA', 'CONFIRMADA', 'EM_ATENDIMENTO', 'CONCLUIDA', 'FALTOU', 'CANCELADA'] as const
const STATUS_FILTRO = [...STATUS, 'REMARCADA'] as const
/** Pode ser remarcada: ainda não aconteceu, ou o paciente faltou e quer outra data. */
const REMARCAVEIS = ['AGENDADA', 'CONFIRMADA', 'FALTOU'] as const
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
  status: z.enum(STATUS_FILTRO).optional(),
})

const avaliacaoBody = z.object({
  nota: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(1000).nullish(),
})

const remarcarBody = z.object({
  inicio: z.coerce.date(),
  profissionalId: z.uuid().optional(), // padrão: o mesmo dentista
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

  /** Filtro base: a clínica do usuário e, para dentista, só a própria agenda. */
  const escopo = (req: FastifyRequest) => {
    const proprio = agendaRestrita(req)
    return { clinicaId: req.user.clinicaId, ...(proprio && { profissionalId: proprio }) }
  }

  /** Dentista só agenda para si mesmo. */
  const exigirProprio = (req: FastifyRequest, profissionalId: string | undefined) => {
    const proprio = agendaRestrita(req)
    if (proprio && profissionalId && profissionalId !== proprio) {
      throw new HttpError(403, 'Você só pode agendar e remarcar na sua própria agenda')
    }
  }

  /** Garante que os IDs referenciados pertencem à clínica do usuário. */
  async function validarRefs(clinicaId: string, r: { pacienteId?: string; profissionalId?: string; procedimentoId?: string | null }) {
    const [pac, prof, proc] = await Promise.all([
      r.pacienteId ? prisma.paciente.findFirst({ where: { id: r.pacienteId, clinicaId } }) : true,
      r.profissionalId ? prisma.profissional.findFirst({ where: { id: r.profissionalId, clinicaId, ativo: true, funcao: 'DENTISTA' } }) : true,
      r.procedimentoId ? prisma.procedimento.findFirst({ where: { id: r.procedimentoId, clinicaId } }) : null,
    ])
    if (!pac) throw naoEncontrado('Paciente')
    if (!prof) throw new HttpError(404, 'Dentista não encontrado (só colaboradores com função dentista recebem consultas)')
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
      throw new HttpError(409, `Conflito com a consulta de ${conflito.paciente.nome} (${fmtDataHora(conflito.inicio)})`)
    }
  }

  app.get('/', async (req) => {
    const q = listQuery.parse(req.query)
    const de = inicioDoDia(q.de)
    const ate = q.ate ? addDias(inicioDoDia(q.ate), 1) : addDias(de, 7)
    return prisma.consulta.findMany({
      where: {
        ...(q.profissionalId && { profissionalId: q.profissionalId }),
        ...escopo(req), // por último: dentista não consegue pedir a agenda de outro
        inicio: { gte: de, lt: ate },
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
    exigirProprio(req, profissionalId)
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
    const c = await prisma.consulta.findFirst({ where: { id, ...escopo(req) }, include: incluir })
    if (!c) throw naoEncontrado('Consulta')
    return c
  })

  app.post('/', async (req, reply) => {
    const d = criarBody.parse(req.body)
    exigirProprio(req, d.profissionalId)
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
    exigirProprio(req, d.profissionalId)
    const clinicaId = req.user.clinicaId
    const atual = await prisma.consulta.findFirst({ where: { id, ...escopo(req) } })
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

  /**
   * Baixa "remarcou": cria a nova consulta (mesmo paciente, procedimento, duração e valor) e marca a original
   * como REMARCADA, numa transação só. Vale também para consulta que já passou (o PUT bloqueia esse caso).
   */
  app.post('/:id/remarcar', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const d = remarcarBody.parse(req.body)
    exigirProprio(req, d.profissionalId)
    const clinicaId = req.user.clinicaId
    const atual = await prisma.consulta.findFirst({ where: { id, ...escopo(req) } })
    if (!atual) throw naoEncontrado('Consulta')
    if (!(REMARCAVEIS as readonly string[]).includes(atual.status)) {
      throw new HttpError(400, 'Só consultas agendadas, confirmadas ou com falta podem ser remarcadas')
    }
    if (d.inicio < new Date()) throw new HttpError(400, 'Escolha um horário futuro para a nova consulta')

    const profissionalId = d.profissionalId ?? atual.profissionalId
    if (d.profissionalId) await validarRefs(clinicaId, { profissionalId })
    const fim = new Date(d.inicio.getTime() + (atual.fim.getTime() - atual.inicio.getTime()))
    await verificarConflito(profissionalId, d.inicio, fim, id) // a própria consulta vai deixar de ocupar o horário

    const anotar = (obs: string | null, txt: string) => (obs ? `${obs}\n${txt}` : txt)
    const [nova, anterior] = await prisma.$transaction([
      prisma.consulta.create({
        data: {
          clinicaId,
          pacienteId: atual.pacienteId,
          profissionalId,
          procedimentoId: atual.procedimentoId,
          inicio: d.inicio,
          fim,
          valor: atual.valor,
          observacoes: `Remarcada de ${fmtDataHora(atual.inicio)}`,
        },
        include: incluir,
      }),
      prisma.consulta.update({
        where: { id },
        data: { status: 'REMARCADA', observacoes: anotar(atual.observacoes, `Remarcada para ${fmtDataHora(d.inicio)}`) },
        include: incluir,
      }),
    ])
    return reply.code(201).send({ anterior, nova })
  })

  /**
   * Nota pós-consulta (1 a 5) + comentário, registrada pela recepção.
   * (Depois virá automática pela pesquisa de satisfação no WhatsApp.) Regravar substitui a anterior.
   */
  app.put('/:id/avaliacao', async (req) => {
    if (req.user.papel === 'DENTISTA') throw new HttpError(403, 'Avaliações são registradas pela recepção')
    const { id } = idParams.parse(req.params)
    const { nota, comentario } = avaliacaoBody.parse(req.body)
    const clinicaId = req.user.clinicaId
    const consulta = await prisma.consulta.findFirst({ where: { id, clinicaId } })
    if (!consulta) throw naoEncontrado('Consulta')
    if (consulta.status !== 'CONCLUIDA') throw new HttpError(400, 'Só consultas realizadas podem ser avaliadas')
    return prisma.avaliacao.upsert({
      where: { consultaId: id },
      create: { clinicaId, consultaId: id, nota, comentario: comentario || null },
      update: { nota, comentario: comentario || null },
    })
  })

  app.patch('/:id/status', async (req) => {
    const { id } = idParams.parse(req.params)
    const { status } = z.object({ status: z.enum(STATUS) }).parse(req.body)
    const { count } = await prisma.consulta.updateMany({ where: { id, ...escopo(req) }, data: { status } })
    if (!count) throw naoEncontrado('Consulta')
    return prisma.consulta.findUniqueOrThrow({ where: { id }, include: incluir })
  })

  app.delete('/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const { count } = await prisma.consulta.deleteMany({ where: { id, ...escopo(req) } })
    if (!count) throw naoEncontrado('Consulta')
    return reply.code(204).send()
  })
}
