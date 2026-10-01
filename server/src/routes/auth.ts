import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { autenticar } from '../auth.ts'
import { prisma } from '../db.ts'
import { HttpError } from '../lib/http.ts'

const registrarBody = z.object({
  clinica: z.object({
    nome: z.string().min(2),
    tipo: z.enum(['CLINICA', 'AUTONOMO']).default('CLINICA'),
  }),
  usuario: z.object({
    nome: z.string().min(2),
    email: z.email().toLowerCase(),
    senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres'),
    cro: z.string().optional(),
  }),
})

const loginBody = z.object({
  email: z.email().toLowerCase(),
  senha: z.string().min(1),
})

// Seg–sex 08–19, sáb 08–12, dom fechado
const HORARIOS_PADRAO = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  abre: '08:00',
  fecha: diaSemana === 6 ? '12:00' : '19:00',
  ativo: diaSemana !== 0,
}))

const usuarioPublico = { id: true, nome: true, email: true, papel: true, clinicaId: true } as const

export default async function authRoutes(app: FastifyInstance) {
  /** Cria a conta (clínica ou autônomo) com o primeiro usuário como ADMIN. */
  app.post('/registrar', async (req, reply) => {
    const { clinica, usuario } = registrarBody.parse(req.body)

    if (await prisma.usuario.findUnique({ where: { email: usuario.email } })) {
      throw new HttpError(409, 'E-mail já cadastrado')
    }

    const senhaHash = await bcrypt.hash(usuario.senha, 10)
    const criado = await prisma.$transaction(async (tx) => {
      const c = await tx.clinica.create({
        data: { nome: clinica.nome, tipo: clinica.tipo, horarios: { create: HORARIOS_PADRAO } },
      })
      const u = await tx.usuario.create({
        data: { clinicaId: c.id, nome: usuario.nome, email: usuario.email, senhaHash, papel: 'ADMIN' },
        select: usuarioPublico,
      })
      // Dentista autônomo: o próprio usuário já é o profissional da agenda
      if (clinica.tipo === 'AUTONOMO') {
        await tx.profissional.create({
          data: { clinicaId: c.id, usuarioId: u.id, nome: usuario.nome, cro: usuario.cro },
        })
      }
      return u
    })

    const token = app.jwt.sign({ sub: criado.id, clinicaId: criado.clinicaId, papel: criado.papel })
    return reply.code(201).send({ token, usuario: criado })
  })

  app.post('/login', async (req) => {
    const { email, senha } = loginBody.parse(req.body)
    const u = await prisma.usuario.findUnique({ where: { email } })
    if (!u || !u.ativo || !(await bcrypt.compare(senha, u.senhaHash))) {
      throw new HttpError(401, 'E-mail ou senha inválidos')
    }
    const token = app.jwt.sign({ sub: u.id, clinicaId: u.clinicaId, papel: u.papel })
    return { token, usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel, clinicaId: u.clinicaId } }
  })

  app.get('/me', { onRequest: autenticar }, async (req) => {
    const u = await prisma.usuario.findUnique({
      where: { id: req.user.sub },
      select: { ...usuarioPublico, clinica: { select: { id: true, nome: true, tipo: true } } },
    })
    if (!u) throw new HttpError(401, 'Usuário não encontrado')
    return u
  })
}
