import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar, exigirPapel } from '../auth.ts'
import { prisma } from '../db.ts'
import { idParams, naoEncontrado } from '../lib/http.ts'

const body = z.object({
  nome: z.string().min(2),
  especialidade: z.string().nullish(),
  cro: z.string().nullish(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor no formato #RRGGBB').optional(),
  ativo: z.boolean().optional(),
  usuarioId: z.uuid().nullish(),
})

export default async function profissionaisRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)

  app.get('/', async (req) => {
    const { todos } = z.object({ todos: z.coerce.boolean().default(false) }).parse(req.query)
    return prisma.profissional.findMany({
      where: { clinicaId: req.user.clinicaId, ...(todos ? {} : { ativo: true }) },
      orderBy: { nome: 'asc' },
    })
  })

  app.post('/', { preHandler: exigirPapel('ADMIN') }, async (req, reply) => {
    const data = body.parse(req.body)
    const criado = await prisma.profissional.create({ data: { ...data, clinicaId: req.user.clinicaId } })
    return reply.code(201).send(criado)
  })

  app.put('/:id', { preHandler: exigirPapel('ADMIN') }, async (req) => {
    const { id } = idParams.parse(req.params)
    const { count } = await prisma.profissional.updateMany({
      where: { id, clinicaId: req.user.clinicaId },
      data: body.partial().parse(req.body),
    })
    if (!count) throw naoEncontrado('Profissional')
    return prisma.profissional.findUniqueOrThrow({ where: { id } })
  })

  /** Não apaga (há consultas ligadas): apenas desativa. */
  app.delete('/:id', { preHandler: exigirPapel('ADMIN') }, async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const { count } = await prisma.profissional.updateMany({ where: { id, clinicaId: req.user.clinicaId }, data: { ativo: false } })
    if (!count) throw naoEncontrado('Profissional')
    return reply.code(204).send()
  })
}
