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

const lembretesBody = z.object({
  lembreteConfirmacao24hAtivo: z.boolean(),
  lembreteConfirmacao24hMensagem: z.string().min(1).max(1000),
  lembreteDiaConsultaAtivo: z.boolean(),
  lembreteDiaConsultaMensagem: z.string().min(1).max(1000),
  lembreteAniversarioAtivo: z.boolean(),
  lembreteAniversarioMensagem: z.string().min(1).max(1000),
  lembreteRetornoAtivo: z.boolean(),
  lembreteRetornoMensagem: z.string().min(1).max(1000),
  lembreteRetornoMesesLimite: z.coerce.number().int().min(1).max(36),
  lembretePesquisaSatisfacaoAtivo: z.boolean(),
  lembretePesquisaSatisfacaoMensagem: z.string().min(1).max(1000),
})

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

  app.get('/lembretes', async (req) => {
    const c = await prisma.clinica.findUniqueOrThrow({
      where: { id: req.user.clinicaId },
      select: {
        lembreteConfirmacao24hAtivo: true, lembreteConfirmacao24hMensagem: true,
        lembreteDiaConsultaAtivo: true, lembreteDiaConsultaMensagem: true,
        lembreteAniversarioAtivo: true, lembreteAniversarioMensagem: true,
        lembreteRetornoAtivo: true, lembreteRetornoMensagem: true, lembreteRetornoMesesLimite: true,
        lembretePesquisaSatisfacaoAtivo: true, lembretePesquisaSatisfacaoMensagem: true,
      },
    })
    return c
  })

  /** Liga/desliga cada lembrete automático e edita a mensagem - só ADMIN, já que isso passa a mandar mensagem pro paciente sozinho. */
  app.put('/lembretes', { preHandler: exigirPapel('ADMIN') }, async (req) =>
    prisma.clinica.update({ where: { id: req.user.clinicaId }, data: lembretesBody.parse(req.body) }),
  )
}
