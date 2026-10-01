import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar, EQUIPE_ATENDIMENTO, exigirPapel } from '../auth.ts'
import { prisma } from '../db.ts'
import type { Prisma } from '../generated/prisma/client.ts'
import { HttpError, idParams, naoEncontrado, normalizarTelefone } from '../lib/http.ts'

const body = z.object({
  nome: z.string().min(2),
  telefone: z.string().min(8).transform(normalizarTelefone),
  email: z.email().nullish(),
  cpf: z.string().nullish(),
  nascimento: z.iso.date().transform((d) => new Date(d)).nullish(),
  convenio: z.string().nullish(),
  observacoes: z.string().nullish(),
  status: z.enum(['ATIVO', 'EM_TRATAMENTO', 'INATIVO']).optional(),
})

const listQuery = z.object({
  busca: z.string().trim().optional(),
  status: z.enum(['ATIVO', 'EM_TRATAMENTO', 'INATIVO']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
})

export default async function pacientesRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)

  /** Lista com busca, filtro, paginação, última visita e próxima consulta. */
  app.get('/', async (req) => {
    const { busca, status, pagina, porPagina } = listQuery.parse(req.query)
    const clinicaId = req.user.clinicaId
    const digitos = busca?.replace(/\D/g, '')

    const where: Prisma.PacienteWhereInput = {
      clinicaId,
      ...(status && { status }),
      ...(busca && {
        OR: [
          { nome: { contains: busca, mode: 'insensitive' } },
          { email: { contains: busca, mode: 'insensitive' } },
          ...(digitos ? [{ telefone: { contains: digitos } }, { cpf: { contains: digitos } }] : []),
        ],
      }),
    }

    const [total, pacientes] = await Promise.all([
      prisma.paciente.count({ where }),
      prisma.paciente.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: {
          consultas: {
            where: { status: { in: ['AGENDADA', 'CONFIRMADA'] }, inicio: { gte: new Date() } },
            orderBy: { inicio: 'asc' },
            take: 1,
            select: { id: true, inicio: true, profissional: { select: { nome: true } } },
          },
        },
      }),
    ])

    const ultimas = await prisma.consulta.groupBy({
      by: ['pacienteId'],
      where: { clinicaId, status: 'CONCLUIDA', pacienteId: { in: pacientes.map((p) => p.id) } },
      _max: { inicio: true },
    })
    const ultimaPorPaciente = new Map(ultimas.map((u) => [u.pacienteId, u._max.inicio]))

    return {
      total,
      pagina,
      porPagina,
      itens: pacientes.map(({ consultas, ...p }) => ({
        ...p,
        ultimaVisita: ultimaPorPaciente.get(p.id) ?? null,
        proximaConsulta: consultas[0] ?? null,
      })),
    }
  })

  app.get('/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    const p = await prisma.paciente.findFirst({
      where: { id, clinicaId: req.user.clinicaId },
      include: {
        consultas: {
          orderBy: { inicio: 'desc' },
          include: {
            profissional: { select: { id: true, nome: true, cor: true } },
            procedimento: { select: { id: true, nome: true } },
          },
        },
      },
    })
    if (!p) throw naoEncontrado('Paciente')
    return p
  })

  app.post('/', { preHandler: exigirPapel(...EQUIPE_ATENDIMENTO) }, async (req, reply) => {
    const data = body.parse(req.body)
    const clinicaId = req.user.clinicaId
    if (await prisma.paciente.findUnique({ where: { clinicaId_telefone: { clinicaId, telefone: data.telefone } } })) {
      throw new HttpError(409, 'Já existe um paciente com este telefone')
    }
    const criado = await prisma.paciente.create({ data: { ...data, clinicaId } })
    // Se já havia uma conversa de WhatsApp com esse número, vincula ao paciente
    await prisma.conversa.updateMany({ where: { clinicaId, telefone: criado.telefone, pacienteId: null }, data: { pacienteId: criado.id } })
    return reply.code(201).send(criado)
  })

  app.put('/:id', { preHandler: exigirPapel(...EQUIPE_ATENDIMENTO) }, async (req) => {
    const { id } = idParams.parse(req.params)
    const { count } = await prisma.paciente.updateMany({
      where: { id, clinicaId: req.user.clinicaId },
      data: body.partial().parse(req.body),
    })
    if (!count) throw naoEncontrado('Paciente')
    return prisma.paciente.findUniqueOrThrow({ where: { id } })
  })

  app.delete('/:id', { preHandler: exigirPapel('ADMIN') }, async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const { count } = await prisma.paciente.deleteMany({ where: { id, clinicaId: req.user.clinicaId } })
    if (!count) throw naoEncontrado('Paciente')
    return reply.code(204).send()
  })
}
