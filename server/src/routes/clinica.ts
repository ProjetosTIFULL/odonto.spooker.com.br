import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar, exigirPapel } from '../auth.ts'
import { prisma } from '../db.ts'
import { horaValida } from '../lib/tempo.ts'

const clinicaBody = z
  .object({
    tipo: z.enum(['CLINICA', 'AUTONOMO']),
    nome: z.string().min(2),
    documento: z.string().nullable(),
    cro: z.string().nullable(),
    telefone: z.string().nullable(),
    email: z.email().nullable(),
    endereco: z.string().nullable(),
  })
  .partial()

const horariosBody = z
  .array(
    z.object({
      diaSemana: z.number().int().min(0).max(6),
      abre: z.string().regex(horaValida, 'Use HH:mm'),
      fecha: z.string().regex(horaValida, 'Use HH:mm'),
      ativo: z.boolean(),
    }),
  )
  .refine((hs) => hs.every((h) => !h.ativo || h.abre < h.fecha), 'Horário de abertura deve ser antes do fechamento')

export default async function clinicaRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)

  app.get('/', async (req) => prisma.clinica.findUniqueOrThrow({ where: { id: req.user.clinicaId } }))

  app.put('/', { preHandler: exigirPapel('ADMIN') }, async (req) =>
    prisma.clinica.update({ where: { id: req.user.clinicaId }, data: clinicaBody.parse(req.body) }),
  )

  app.get('/horarios', async (req) =>
    prisma.horarioAtendimento.findMany({ where: { clinicaId: req.user.clinicaId }, orderBy: { diaSemana: 'asc' } }),
  )

  /** Substitui os horários dos dias enviados (upsert por dia da semana). */
  app.put('/horarios', { preHandler: exigirPapel('ADMIN') }, async (req) => {
    const clinicaId = req.user.clinicaId
    const horarios = horariosBody.parse(req.body)
    await prisma.$transaction(
      horarios.map((h) =>
        prisma.horarioAtendimento.upsert({
          where: { clinicaId_diaSemana: { clinicaId, diaSemana: h.diaSemana } },
          create: { clinicaId, ...h },
          update: h,
        }),
      ),
    )
    return prisma.horarioAtendimento.findMany({ where: { clinicaId }, orderBy: { diaSemana: 'asc' } })
  })
}
