// Conexao de WhatsApp da clinica - fala direto com o api-gateway do
// Orquestrador (spooker-platform), rede interna, sem autenticacao propria
// (mesmo padrao que o resto do Orquestrador ja usa pra isso). A clinica
// precisa ja estar ligada a um agente (Clinica.agentId) - ver documentacao
// de integracao.

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar, EQUIPE_ATENDIMENTO, exigirPapel } from '../auth.ts'
import { prisma } from '../db.ts'
import { env } from '../env.ts'
import { HttpError } from '../lib/http.ts'

async function agentIdDaClinica(clinicaId: string): Promise<number> {
  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { agentId: true } })
  if (!clinica?.agentId) {
    throw new HttpError(400, 'Esta clínica ainda não tem um agente de IA/WhatsApp vinculado. Fale com o suporte Spooker.')
  }
  return clinica.agentId
}

export default async function whatsappRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)
  app.addHook('preHandler', exigirPapel(...EQUIPE_ATENDIMENTO))

  app.get('/status', async (req) => {
    const agentId = await agentIdDaClinica(req.user.clinicaId)
    const r = await fetch(`${env.GATEWAY_URL}/orquestrador/status_agente/${agentId}`)
    return r.json()
  })

  app.get('/qrcode', async (req) => {
    const { numero } = z.object({ numero: z.string().optional() }).parse(req.query)
    const agentId = await agentIdDaClinica(req.user.clinicaId)
    const url = new URL(`${env.GATEWAY_URL}/orquestrador/qrcode_agente/${agentId}`)
    if (numero) url.searchParams.set('numero', numero)
    const r = await fetch(url)
    return r.json()
  })

  app.post('/desconectar', { preHandler: exigirPapel('ADMIN') }, async (req) => {
    const agentId = await agentIdDaClinica(req.user.clinicaId)
    const r = await fetch(`${env.GATEWAY_URL}/orquestrador/desconectar_agente/${agentId}`, { method: 'POST' })
    return r.json()
  })
}
