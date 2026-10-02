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
import { salvarMidia } from '../lib/midia.ts'
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
    "Retorna horários livres de um dentista num dia (formato AAAA-MM-DD). periodo é opcional: 'manha', 'tarde' ou " +
      'noite\'. ATENÇÃO: isso só CONSULTA a agenda, não marca nada. Ver um horário aqui NÃO significa que a ' +
      'consulta foi agendada - depois que o cliente confirmar o horário, você AINDA PRECISA chamar a ferramenta ' +
      'agendar_consulta para criar a consulta de verdade. NUNCA diga ao cliente que a consulta está marcada/' +
      'confirmada sem antes ter chamado agendar_consulta e recebido {"status":"agendado"} de volta.',
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
    'Cria a consulta DE VERDADE na agenda (sem chamar isso, NADA fica marcado, mesmo que você já tenha visto o ' +
      'horário como livre). Busca o paciente pelo número de WhatsApp de quem está mandando a mensagem (ou ' +
      'cadastra se não existir) e cria a consulta no horário pedido, já usando o número certo internamente. ' +
      'NUNCA peça o telefone ao cliente - o numero_whatsapp já é o número real e correto de quem está ' +
      'conversando, preenchido automaticamente pelo sistema. Formato data_hora: "AAAA-MM-DD HH:MM". Só diga ao ' +
      'cliente que a consulta está confirmada DEPOIS de chamar esta ferramenta e ela responder com sucesso ' +
      '(status "agendado") - nunca antes.',
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
// Limite maior que o padrao (100kb) - midia recebida do paciente chega
// aqui como JSON base64 (overhead de ~33% sobre o arquivo original).
app.use(express.json({ limit: '25mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

/**
 * Acha (ou cria) a Conversa certa pra uma mensagem chegando/saindo,
 * religando ao Paciente se for o caso - usado tanto por /mensagens/
 * registrar (texto) quanto /mensagens/midia (foto/video/documento).
 */
async function conversaParaMensagem(agentId: number, numeroWhatsapp: string, nomeContato: string | null | undefined, remetente: 'PACIENTE' | 'CLINICA') {
  const clinicaId = await resolverClinicaId(agentId)
  const telefone = normalizarTelefone(numeroWhatsapp.split('@')[0])
  const paciente = await prisma.paciente.findUnique({ where: { clinicaId_telefone: { clinicaId, telefone } } })
  const conversa = await prisma.conversa.upsert({
    where: { clinicaId_telefone: { clinicaId, telefone } },
    create: { clinicaId, telefone, nomeContato, pacienteId: paciente?.id },
    update: {
      ultimaMensagemEm: new Date(),
      ...(remetente === 'PACIENTE' && { naoLidas: { increment: 1 } }),
      ...(nomeContato && { nomeContato }),
      // Religa ao paciente se ele foi cadastrado DEPOIS que essa conversa
      // ja existia (ex: criado durante o proprio agendamento) - uma
      // conversa que ja estava ligada nunca e desligada aqui.
      ...(paciente && { pacienteId: paciente.id }),
    },
  })
  return conversa
}

/**
 * Espelha uma mensagem de TEXTO (de qualquer lado) na tela de Chat do
 * Portal - chamado pelo Orquestrador (spooker-platform) depois de
 * processar cada mensagem, best-effort do lado de quem chama (nunca
 * deve travar o atendimento se o Portal estiver fora do ar). Rota
 * simples HTTP, fora do protocolo MCP (nao e uma ferramenta que a IA
 * decide chamar).
 */
app.post('/mensagens/registrar', async (req, res) => {
  const corpo = z
    .object({
      agent_id: z.number(),
      numero_whatsapp: z.string(),
      nome_contato: z.string().nullish(),
      remetente: z.enum(['PACIENTE', 'CLINICA']),
      texto: z.string().min(1),
      whatsapp_id: z.string().nullish(),
    })
    .safeParse(req.body)
  if (!corpo.success) return res.status(400).json({ erro: 'Dados inválidos' })

  try {
    const conversa = await conversaParaMensagem(corpo.data.agent_id, corpo.data.numero_whatsapp, corpo.data.nome_contato, corpo.data.remetente)
    await prisma.mensagem.create({
      data: { conversaId: conversa.id, de: corpo.data.remetente, texto: corpo.data.texto, whatsappId: corpo.data.whatsapp_id },
    })
    res.json({ status: 'registrado' })
  } catch (e) {
    if (e instanceof ErroFerramenta) return res.status(404).json({ erro: e.message })
    console.error(e)
    res.status(500).json({ erro: 'Erro interno' })
  }
})

/**
 * Confirmacao de entrega/leitura (evento messages.update da Evolution
 * API, repassado pelo Orquestrador) - atualiza o status da mensagem
 * CLINICA que tem esse whatsapp_id. Silenciosamente nao faz nada se
 * nao achar (mensagem pode ter sido mandada antes dessa funcionalidade
 * existir, ou o espelhamento pode ter falhado).
 */
app.post('/mensagens/status', async (req, res) => {
  const corpo = z.object({ whatsapp_id: z.string().min(1), status: z.enum(['ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU']) }).safeParse(req.body)
  if (!corpo.success) return res.status(400).json({ erro: 'Dados inválidos' })

  await prisma.mensagem.updateMany({ where: { whatsappId: corpo.data.whatsapp_id }, data: { status: corpo.data.status } })
  res.json({ status: 'ok' })
})

/**
 * Espelha uma mensagem de MIDIA (foto/video/audio/documento) recebida
 * de um paciente - chamado pelo Orquestrador quando o webhook da
 * Evolution API traz uma mensagem desse tipo. Salva o arquivo aqui
 * mesmo (pasta compartilhada com o container "api", que serve em
 * /api/uploads/).
 */
app.post('/mensagens/midia', async (req, res) => {
  const corpo = z
    .object({
      agent_id: z.number(),
      numero_whatsapp: z.string(),
      nome_contato: z.string().nullish(),
      data_base64: z.string().min(1),
      mime_type: z.string().min(1),
      legenda: z.string().nullish(),
    })
    .safeParse(req.body)
  if (!corpo.success) return res.status(400).json({ erro: 'Dados inválidos' })

  try {
    const conversa = await conversaParaMensagem(corpo.data.agent_id, corpo.data.numero_whatsapp, corpo.data.nome_contato, 'PACIENTE')
    const { caminhoRelativo, tipo } = await salvarMidia(corpo.data.data_base64, corpo.data.mime_type)
    await prisma.mensagem.create({
      data: { conversaId: conversa.id, de: 'PACIENTE', texto: corpo.data.legenda, midiaUrl: caminhoRelativo, midiaTipo: tipo },
    })
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
