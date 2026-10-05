import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar, EQUIPE_ATENDIMENTO, exigirPapel } from '../auth.ts'
import { prisma } from '../db.ts'
import { env } from '../env.ts'
import { idParams, naoEncontrado, normalizarTelefone } from '../lib/http.ts'
import { salvarMidia } from '../lib/midia.ts'
import { enviarMidiaPeloWhatsApp, enviarPeloWhatsApp } from '../lib/whatsapp.ts'

// O recebimento (mensagem do paciente) chega pelo Orquestrador, que
// espelha aqui via POST /mensagens/registrar no MCP (ver server/src/mcp/
// server.ts). O envio manual (resposta digitada pelo atendente) sai de
// verdade pelo WhatsApp chamando o api-gateway do Orquestrador direto -
// best-effort: se falhar, a mensagem fica salva aqui mas nao conseguiu
// sair, e avisamos o atendente.

/**
 * Busca a foto de perfil atual do WhatsApp - best-effort (undefined se
 * nao foi possivel checar agora, pra nao apagar uma foto ja salva por
 * causa de uma falha temporaria; null quando checou e a pessoa
 * realmente nao tem foto).
 */
async function buscarFotoPerfil(clinicaId: string, telefone: string): Promise<string | null | undefined> {
  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { agentId: true } })
  if (!clinica?.agentId) return undefined
  try {
    const r = await fetch(`${env.GATEWAY_URL}/orquestrador/foto_perfil?agent_id=${clinica.agentId}&numero_whatsapp=${encodeURIComponent(telefone)}`)
    const data = (await r.json()) as { url?: string | null }
    return data.url ?? null
  } catch {
    return undefined
  }
}

export default async function conversasRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)
  app.addHook('preHandler', exigirPapel(...EQUIPE_ATENDIMENTO))

  async function buscar(id: string, clinicaId: string) {
    const c = await prisma.conversa.findFirst({ where: { id, clinicaId } })
    if (!c) throw naoEncontrado('Conversa')
    return c
  }

  app.get('/', async (req) => {
    const { busca } = z.object({ busca: z.string().trim().optional() }).parse(req.query)
    const digitos = busca?.replace(/\D/g, '')
    const conversas = await prisma.conversa.findMany({
      where: {
        clinicaId: req.user.clinicaId,
        ...(busca && {
          OR: [
            { nomeContato: { contains: busca, mode: 'insensitive' } },
            { paciente: { nome: { contains: busca, mode: 'insensitive' } } },
            ...(digitos ? [{ telefone: { contains: digitos } }] : []),
          ],
        }),
      },
      orderBy: { ultimaMensagemEm: 'desc' },
      include: {
        paciente: { select: { id: true, nome: true, convenio: true } },
        mensagens: { orderBy: { enviadaEm: 'desc' }, take: 1 },
      },
    })
    return conversas.map(({ mensagens, ...c }) => ({ ...c, ultimaMensagem: mensagens[0] ?? null }))
  })

  /** Abre (ou cria) a conversa com um número. */
  app.post('/', async (req, reply) => {
    const { telefone, nomeContato } = z
      .object({ telefone: z.string().min(8).transform(normalizarTelefone), nomeContato: z.string().optional() })
      .parse(req.body)
    const clinicaId = req.user.clinicaId
    const paciente = await prisma.paciente.findUnique({ where: { clinicaId_telefone: { clinicaId, telefone } } })
    const conversa = await prisma.conversa.upsert({
      where: { clinicaId_telefone: { clinicaId, telefone } },
      create: { clinicaId, telefone, nomeContato, pacienteId: paciente?.id },
      update: {},
    })
    return reply.code(201).send(conversa)
  })

  /**
   * Mensagens da conversa; ao abrir, zera as não lidas. O front chama
   * essa mesma rota tanto na abertura (1x) quanto no polling (a cada
   * 3s, pra pegar mensagem nova) - so refaz a busca da foto de perfil
   * na abertura de verdade (?atualizarFoto=1), senao a Evolution API
   * levaria uma chamada a cada 3s por nada.
   */
  app.get('/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    const { atualizarFoto } = z.object({ atualizarFoto: z.coerce.boolean().optional() }).parse(req.query)
    const conversa = await buscar(id, req.user.clinicaId)
    const fotoUrl = atualizarFoto ? await buscarFotoPerfil(req.user.clinicaId, conversa.telefone) : undefined
    return prisma.conversa.update({
      where: { id },
      data: { naoLidas: 0, ...(fotoUrl !== undefined && { fotoUrl }) },
      include: {
        paciente: { select: { id: true, nome: true, convenio: true } },
        mensagens: { orderBy: { enviadaEm: 'asc' } },
      },
    })
  })

  app.post('/:id/mensagens', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const { texto } = z.object({ texto: z.string().trim().min(1).max(4096) }).parse(req.body)
    const clinicaId = req.user.clinicaId
    const conversa = await buscar(id, clinicaId)

    const { erro: erroEnvio, whatsappId } = await enviarPeloWhatsApp(clinicaId, conversa.telefone, texto)

    const [mensagem] = await prisma.$transaction([
      prisma.mensagem.create({ data: { conversaId: id, de: 'CLINICA', texto, whatsappId } }),
      prisma.conversa.update({ where: { id }, data: { ultimaMensagemEm: new Date() } }),
    ])
    return reply.code(201).send({ ...mensagem, avisoEnvio: erroEnvio })
  })

  /** Envia foto/vídeo/documento pelo WhatsApp - arquivo em base64 no corpo (sem multipart, simples e suficiente pro tamanho típico de mídia de chat). */
  app.post('/:id/midia', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const { dataBase64, mimeType, nomeArquivo, legenda } = z
      .object({
        dataBase64: z.string().min(1), mimeType: z.string().min(1),
        nomeArquivo: z.string().trim().optional(), legenda: z.string().trim().max(1024).optional(),
      })
      .parse(req.body)
    const clinicaId = req.user.clinicaId
    const conversa = await buscar(id, clinicaId)

    const { caminhoRelativo, tipo } = await salvarMidia(dataBase64, mimeType)
    const { erro: erroEnvio, whatsappId } = await enviarMidiaPeloWhatsApp(clinicaId, conversa.telefone, dataBase64, tipo, nomeArquivo || 'arquivo', legenda)

    const [mensagem] = await prisma.$transaction([
      prisma.mensagem.create({ data: { conversaId: id, de: 'CLINICA', texto: legenda, midiaUrl: caminhoRelativo, midiaTipo: tipo, whatsappId } }),
      prisma.conversa.update({ where: { id }, data: { ultimaMensagemEm: new Date() } }),
    ])
    return reply.code(201).send({ ...mensagem, avisoEnvio: erroEnvio })
  })

  /** Liga a conversa a um paciente já cadastrado. */
  app.put('/:id/paciente', async (req) => {
    const { id } = idParams.parse(req.params)
    const { pacienteId } = z.object({ pacienteId: z.uuid() }).parse(req.body)
    const clinicaId = req.user.clinicaId
    await buscar(id, clinicaId)
    if (!(await prisma.paciente.findFirst({ where: { id: pacienteId, clinicaId } }))) throw naoEncontrado('Paciente')
    return prisma.conversa.update({ where: { id }, data: { pacienteId } })
  })
}
