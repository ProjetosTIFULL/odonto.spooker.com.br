import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar, exigirPapel } from '../auth.ts'
import { prisma } from '../db.ts'
import { idParams, naoEncontrado } from '../lib/http.ts'

const body = z.object({
  nome: z.string().min(2),
  codigoTuss: z.string().nullish(),
  duracaoMin: z.number().int().min(5).max(600).optional(),
  valor: z.number().nonnegative(),
  ativo: z.boolean().optional(),
})

export default async function procedimentosRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)

  app.get('/', async (req) => {
    const { todos } = z.object({ todos: z.coerce.boolean().default(false) }).parse(req.query)
    return prisma.procedimento.findMany({
      where: { clinicaId: req.user.clinicaId, ...(todos ? {} : { ativo: true }) },
      orderBy: { nome: 'asc' },
    })
  })

  app.post('/', { preHandler: exigirPapel('ADMIN') }, async (req, reply) => {
    const data = body.parse(req.body)
    return reply.code(201).send(await prisma.procedimento.create({ data: { ...data, clinicaId: req.user.clinicaId } }))
  })

  app.put('/:id', { preHandler: exigirPapel('ADMIN') }, async (req) => {
    const { id } = idParams.parse(req.params)
    const { count } = await prisma.procedimento.updateMany({
      where: { id, clinicaId: req.user.clinicaId },
      data: body.partial().parse(req.body),
    })
    if (!count) throw naoEncontrado('Procedimento')
    return prisma.procedimento.findUniqueOrThrow({ where: { id } })
  })

  app.delete('/:id', { preHandler: exigirPapel('ADMIN') }, async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const { count } = await prisma.procedimento.updateMany({ where: { id, clinicaId: req.user.clinicaId }, data: { ativo: false } })
    if (!count) throw naoEncontrado('Procedimento')
    return reply.code(204).send()
  })
}
