import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar } from '../auth.ts'
import { prisma } from '../db.ts'
import { idParams, naoEncontrado, normalizarTelefone } from '../lib/http.ts'

// Por enquanto as mensagens só são gravadas no banco.
// O envio/recebimento real pelo WhatsApp entra quando a integração for definida.

export default async function conversasRoutes(app: FastifyInstance) {
  app.addHook('onRequest', autenticar)

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

  /** Mensagens da conversa; ao abrir, zera as não lidas. */
  app.get('/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    await buscar(id, req.user.clinicaId)
    return prisma.conversa.update({
      where: { id },
      data: { naoLidas: 0 },
      include: {
        paciente: { select: { id: true, nome: true, convenio: true } },
        mensagens: { orderBy: { enviadaEm: 'asc' } },
      },
    })
  })

  app.post('/:id/mensagens', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const { texto } = z.object({ texto: z.string().trim().min(1).max(4096) }).parse(req.body)
    await buscar(id, req.user.clinicaId)
    const [mensagem] = await prisma.$transaction([
      prisma.mensagem.create({ data: { conversaId: id, de: 'CLINICA', texto } }),
      prisma.conversa.update({ where: { id }, data: { ultimaMensagemEm: new Date() } }),
    ])
    return reply.code(201).send(mensagem)
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
