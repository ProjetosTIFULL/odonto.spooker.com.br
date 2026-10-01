// Colaboradores da clínica: dentistas/médicos e secretários/operadores.
// Só colaboradores com função DENTISTA aparecem como coluna na agenda e podem receber consultas.

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar, exigirPapel } from '../auth.ts'
import { prisma } from '../db.ts'
import { idParams, naoEncontrado } from '../lib/http.ts'

const FUNCOES = ['DENTISTA', 'SECRETARIO'] as const

const body = z.object({
  nome: z.string().min(2),
  funcao: z.enum(FUNCOES).optional(),
  especialidade: z.string().nullish(),
  cro: z.string().nullish(),
  telefone: z.string().nullish(),
  email: z.email().nullish(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor no formato #RRGGBB').optional(),
  ativo: z.boolean().optional(),
})

const listQuery = z.object({
  todos: z.coerce.boolean().default(false), // inclui inativos
  funcao: z.enum(FUNCOES).optional(),
})

const incluir = { usuario: { select: { id: true, email: true, papel: true, ativo: true } } } as const

export default async function profissionaisRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)

  app.get('/', async (req) => {
    const { todos, funcao } = listQuery.parse(req.query)
    return prisma.profissional.findMany({
      where: { clinicaId: req.user.clinicaId, ...(todos ? {} : { ativo: true }), ...(funcao && { funcao }) },
      orderBy: [{ funcao: 'asc' }, { nome: 'asc' }],
      // Login vinculado só interessa a quem administra
      ...(req.user.papel === 'ADMIN' && { include: incluir }),
    })
  })

  app.post('/', { preHandler: exigirPapel('ADMIN') }, async (req, reply) => {
    const data = body.parse(req.body)
    const criado = await prisma.profissional.create({ data: { ...data, clinicaId: req.user.clinicaId }, include: incluir })
    return reply.code(201).send(criado)
  })

  app.put('/:id', { preHandler: exigirPapel('ADMIN') }, async (req) => {
    const { id } = idParams.parse(req.params)
    const { count } = await prisma.profissional.updateMany({
      where: { id, clinicaId: req.user.clinicaId },
      data: body.partial().parse(req.body),
    })
    if (!count) throw naoEncontrado('Colaborador')
    return prisma.profissional.findUniqueOrThrow({ where: { id }, include: incluir })
  })

  /** Não apaga (há consultas ligadas): apenas desativa. */
  app.delete('/:id', { preHandler: exigirPapel('ADMIN') }, async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const { count } = await prisma.profissional.updateMany({ where: { id, clinicaId: req.user.clinicaId }, data: { ativo: false } })
    if (!count) throw naoEncontrado('Colaborador')
    return reply.code(204).send()
  })
}
