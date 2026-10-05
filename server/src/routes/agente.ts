// Configuração REAL do agente de IA (Orquestrador/spooker-platform) que
// atende essa clínica no WhatsApp. De propósito NÃO expõe "adicionar
// servidor MCP" nem "skills plugáveis" - o MCP que a IA usa (mcp_url) é
// fixo, decidido pelo administrador do SaaS na hora de ligar o agente
// real a essa clínica, nunca pelo cliente final: deixar o cliente plugar
// servidores MCP arbitrários na IA que fala com os próprios pacientes
// dele seria abrir uma porta de segurança real (um MCP malicioso teria
// acesso à conversa e às ferramentas da IA).

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar, EQUIPE_ATENDIMENTO, exigirPapel } from '../auth.ts'
import { env } from '../env.ts'
import { HttpError } from '../lib/http.ts'
import { agentIdDaClinica } from './whatsapp.ts'

type AgenteApi = {
  id: number
  name: string
  system_prompt: string | null
  ai_paused: boolean
  settings: { ai_provider?: string; ai_model?: string; nicho?: string; mcp_url?: string }
}

const corpoAtualizar = z
  .object({
    name: z.string().min(1).max(200),
    system_prompt: z.string().max(4000).nullable(),
    ai_provider: z.enum(['groq', 'anthropic']),
    ai_model: z.string().min(1).max(100),
    nicho: z.string().max(2000).nullable(),
  })
  .partial()

export default async function agenteRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)
  app.addHook('preHandler', exigirPapel(...EQUIPE_ATENDIMENTO))

  app.get('/', async (req) => {
    const agentId = await agentIdDaClinica(req.user.clinicaId)
    const r = await fetch(`${env.GATEWAY_URL}/orquestrador/buscar_agente_por_id/${agentId}`)
    const data = (await r.json()) as AgenteApi | { erro: string }
    if ('erro' in data) throw new HttpError(502, data.erro)
    return data
  })

  app.put('/', { preHandler: exigirPapel('ADMIN') }, async (req) => {
    const agentId = await agentIdDaClinica(req.user.clinicaId)
    const body = corpoAtualizar.parse(req.body)
    const r = await fetch(`${env.GATEWAY_URL}/orquestrador/atualizar_agente/${agentId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await r.json()) as { status?: string; erro?: string }
    if (data.erro) throw new HttpError(502, data.erro)
    return data
  })

  app.post('/pausar', { preHandler: exigirPapel('ADMIN') }, async (req) => {
    const agentId = await agentIdDaClinica(req.user.clinicaId)
    const r = await fetch(`${env.GATEWAY_URL}/orquestrador/pausar_agente_ia/${agentId}`, { method: 'POST' })
    return r.json()
  })

  app.post('/retomar', { preHandler: exigirPapel('ADMIN') }, async (req) => {
    const agentId = await agentIdDaClinica(req.user.clinicaId)
    const r = await fetch(`${env.GATEWAY_URL}/orquestrador/retomar_agente_ia/${agentId}`, { method: 'POST' })
    return r.json()
  })
}
