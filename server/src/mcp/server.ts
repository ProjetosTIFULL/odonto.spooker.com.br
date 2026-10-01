// Servidor MCP de odontologia - expoe as ferramentas de tools.ts via MCP
// Streamable HTTP, o mesmo protocolo que o Orquestrador (spooker-platform)
// ja fala com o agenda-mcp generico hoje. Processo separado da API
// principal (porta propria), mesmo banco (Prisma/Postgres) do Portal.

import express from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { env } from '../env.ts'
import * as tools from './tools.ts'

function resultadoJson(valor: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(valor) }] }
}

function criarServidor() {
  const server = new McpServer({ name: 'odonto-mcp', version: '1.0.0' })

  server.tool(
    'listar_profissionais',
    'Lista os dentistas ativos da clínica.',
    { agent_id: z.number() },
    async (args) => resultadoJson(await tools.listarProfissionais(args)),
  )

  server.tool(
    'buscar_horarios_disponiveis',
    "Retorna horários livres de um dentista num dia (formato AAAA-MM-DD). periodo é opcional: 'manha', 'tarde' ou 'noite'.",
    {
      agent_id: z.number(),
      data: z.string(),
      periodo: z.string().optional(),
      profissional_id: z.string().optional(),
    },
    async (args) => resultadoJson(await tools.buscarHorariosDisponiveis(args)),
  )

  server.tool(
    'agendar_consulta',
    'Agenda uma consulta de ponta a ponta: busca o paciente pelo número de WhatsApp (ou cadastra se não existir) ' +
      'e cria a consulta no horário pedido. data_hora no formato "AAAA-MM-DD HH:MM".',
    {
      agent_id: z.number(),
      numero_whatsapp: z.string(),
      nome_paciente: z.string().optional(),
      data_hora: z.string(),
      tipo_consulta: z.string().optional(),
      profissional_id: z.string().optional(),
    },
    async (args) => resultadoJson(await tools.agendarConsulta(args)),
  )

  server.tool(
    'buscar_item_catalogo',
    'Busca um procedimento do catálogo pelo nome, para responder dúvida de preço/informação.',
    { agent_id: z.number(), busca: z.string() },
    async (args) => resultadoJson(await tools.buscarItemCatalogo(args)),
  )

  server.tool(
    'escalar_para_humano',
    'Sinaliza que a conversa precisa de atendimento humano.',
    { agent_id: z.number(), numero_whatsapp: z.string(), motivo: z.string().optional() },
    async (args) => resultadoJson(await tools.escalarParaHumano(args)),
  )

  return server
}

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

// Stateless: cada chamada cria sua propria sessao MCP e fecha no final -
// mais simples e seguro que manter sessao viva entre chamadas, e cada
// tool call ja carrega tudo que precisa (agent_id etc) nos argumentos.
app.post('/mcp', async (req, res) => {
  const server = criarServidor()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

app.listen(env.MCP_PORT, '0.0.0.0', () => {
  console.log(`MCP de odontologia rodando na porta ${env.MCP_PORT}`)
})
