import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { autenticar, exigirPapel } from '../auth.ts'
import { prisma } from '../db.ts'
import { HttpError, idParams, naoEncontrado } from '../lib/http.ts'

const PAPEIS = ['ADMIN', 'DENTISTA', 'RECEPCAO'] as const
const select = { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true } as const

const criarBody = z.object({
  nome: z.string().min(2),
  email: z.email().toLowerCase(),
  senha: z.string().min(8),
  papel: z.enum(PAPEIS),
})

const atualizarBody = z.object({
  nome: z.string().min(2),
  papel: z.enum(PAPEIS),
  ativo: z.boolean(),
  senha: z.string().min(8),
}).partial()

export default async function usuariosRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)
  app.addHook('preHandler', exigirPapel('ADMIN'))

  app.get('/', async (req) =>
    prisma.usuario.findMany({ where: { clinicaId: req.user.clinicaId }, select, orderBy: { nome: 'asc' } }),
  )

  app.post('/', async (req, reply) => {
    const { senha, ...d } = criarBody.parse(req.body)
    if (await prisma.usuario.findUnique({ where: { email: d.email } })) throw new HttpError(409, 'E-mail já cadastrado')
    const u = await prisma.usuario.create({
      data: { ...d, clinicaId: req.user.clinicaId, senhaHash: await bcrypt.hash(senha, 10) },
      select,
    })
    return reply.code(201).send(u)
  })

  app.put('/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    const { senha, ...d } = atualizarBody.parse(req.body)
    if (id === req.user.sub && (d.ativo === false || (d.papel && d.papel !== 'ADMIN'))) {
      throw new HttpError(400, 'Você não pode desativar ou rebaixar o próprio usuário')
    }
    const { count } = await prisma.usuario.updateMany({
      where: { id, clinicaId: req.user.clinicaId },
      data: { ...d, ...(senha && { senhaHash: await bcrypt.hash(senha, 10) }) },
    })
    if (!count) throw naoEncontrado('Usuário')
    return prisma.usuario.findUniqueOrThrow({ where: { id }, select })
  })
}
