// Servidor MCP de odontologia - expoe as ferramentas de tools.ts via MCP
// Streamable HTTP, o mesmo protocolo que o Orquestrador (spooker-platform)
// ja fala com o agenda-mcp generico hoje. Processo separado da API
// principal (porta propria), mesmo banco (Prisma/Postgres) do Portal.

import express from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { prisma } from '../db.ts'
import { env } from '../env.ts'
import { normalizarTelefone } from '../lib/http.ts'
import * as tools from './tools.ts'
import { ErroFerramenta, resolverClinicaId } from './tools.ts'

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

/**
 * Espelha uma mensagem (de qualquer lado) na tela de Chat do Portal -
 * chamado pelo Orquestrador (spooker-platform) depois de processar cada
 * mensagem, best-effort do lado de quem chama (nunca deve travar o
 * atendimento se o Portal estiver fora do ar). Rota simples HTTP, fora do
 * protocolo MCP (nao e uma ferramenta que a IA decide chamar).
 */
app.post('/mensagens/registrar', async (req, res) => {
  const corpo = z
    .object({
      agent_id: z.number(),
      numero_whatsapp: z.string(),
      nome_contato: z.string().nullish(),
      remetente: z.enum(['PACIENTE', 'CLINICA']),
      texto: z.string().min(1),
    })
    .safeParse(req.body)
  if (!corpo.success) return res.status(400).json({ erro: 'Dados inválidos' })

  try {
    const clinicaId = await resolverClinicaId(corpo.data.agent_id)
    const telefone = normalizarTelefone(corpo.data.numero_whatsapp.split('@')[0])
    const paciente = await prisma.paciente.findUnique({ where: { clinicaId_telefone: { clinicaId, telefone } } })
    const conversa = await prisma.conversa.upsert({
      where: { clinicaId_telefone: { clinicaId, telefone } },
      create: { clinicaId, telefone, nomeContato: corpo.data.nome_contato, pacienteId: paciente?.id },
      update: {
        ultimaMensagemEm: new Date(),
        ...(corpo.data.remetente === 'PACIENTE' && { naoLidas: { increment: 1 } }),
        ...(corpo.data.nome_contato && { nomeContato: corpo.data.nome_contato }),
      },
    })
    await prisma.mensagem.create({ data: { conversaId: conversa.id, de: corpo.data.remetente, texto: corpo.data.texto } })
    res.json({ status: 'registrado' })
  } catch (e) {
    if (e instanceof ErroFerramenta) return res.status(404).json({ erro: e.message })
    console.error(e)
    res.status(500).json({ erro: 'Erro interno' })
  }
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
