// Logins da clínica (Configurações > Usuários e permissões). Somente ADMIN.
// Cada usuário pode ser vinculado a um colaborador (Profissional).

import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { autenticar, exigirPapel } from '../auth.ts'
import { prisma } from '../db.ts'
import { HttpError, idParams, naoEncontrado } from '../lib/http.ts'

const PAPEIS = ['ADMIN', 'OPERADOR', 'DENTISTA'] as const
const select = {
  id: true,
  nome: true,
  email: true,
  papel: true,
  ativo: true,
  criadoEm: true,
  profissional: { select: { id: true, nome: true, funcao: true } },
} as const

const criarBody = z.object({
  nome: z.string().min(2),
  email: z.email().toLowerCase(),
  senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres'),
  papel: z.enum(PAPEIS),
  profissionalId: z.uuid().nullish(),
})

const atualizarBody = z
  .object({
    nome: z.string().min(2),
    papel: z.enum(PAPEIS),
    ativo: z.boolean(),
    senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres'),
    profissionalId: z.uuid().nullable(), // null desvincula
  })
  .partial()

export default async function usuariosRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)
  app.addHook('preHandler', exigirPapel('ADMIN'))

  /** Garante que o colaborador é da clínica e não está ligado a outro login. */
  async function validarColaborador(clinicaId: string, profissionalId: string, usuarioId?: string) {
    const p = await prisma.profissional.findFirst({ where: { id: profissionalId, clinicaId } })
    if (!p) throw naoEncontrado('Colaborador')
    if (p.usuarioId && p.usuarioId !== usuarioId) throw new HttpError(409, `${p.nome} já tem um login vinculado`)
  }

  app.get('/', async (req) =>
    prisma.usuario.findMany({ where: { clinicaId: req.user.clinicaId }, select, orderBy: { nome: 'asc' } }),
  )

  app.post('/', async (req, reply) => {
    const { senha, profissionalId, ...d } = criarBody.parse(req.body)
    const clinicaId = req.user.clinicaId
    if (await prisma.usuario.findUnique({ where: { email: d.email } })) throw new HttpError(409, 'E-mail já cadastrado')
    if (profissionalId) await validarColaborador(clinicaId, profissionalId)

    const u = await prisma.usuario.create({
      data: {
        ...d,
        clinicaId,
        senhaHash: await bcrypt.hash(senha, 10),
        ...(profissionalId && { profissional: { connect: { id: profissionalId } } }),
      },
      select,
    })
    return reply.code(201).send(u)
  })

  app.put('/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    const { senha, profissionalId, ...d } = atualizarBody.parse(req.body)
    const clinicaId = req.user.clinicaId
    if (id === req.user.sub && (d.ativo === false || (d.papel && d.papel !== 'ADMIN'))) {
      throw new HttpError(400, 'Você não pode desativar ou rebaixar o próprio usuário')
    }
    const atual = await prisma.usuario.findFirst({ where: { id, clinicaId } })
    if (!atual) throw naoEncontrado('Usuário')
    if (profissionalId) await validarColaborador(clinicaId, profissionalId, id)

    return prisma.usuario.update({
      where: { id },
      data: {
        ...d,
        ...(senha && { senhaHash: await bcrypt.hash(senha, 10) }),
        ...(profissionalId !== undefined && {
          profissional: profissionalId ? { connect: { id: profissionalId } } : { disconnect: true },
        }),
      },
      select,
    })
  })
}
