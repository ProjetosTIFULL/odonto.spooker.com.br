import { env } from '../env.ts'
import { prisma } from '../db.ts'
import { normalizarTelefone } from './http.ts'

type ResultadoEnvio = { erro: string | null; whatsappId: string | null }

/** Envia uma mensagem de TEXTO pelo WhatsApp real do agente ligado a essa clínica - best-effort. */
export async function enviarPeloWhatsApp(clinicaId: string, telefone: string, texto: string): Promise<ResultadoEnvio> {
  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { agentId: true } })
  if (!clinica?.agentId) return { erro: 'Esta clínica ainda não tem um agente de WhatsApp vinculado.', whatsappId: null }
  try {
    const r = await fetch(`${env.GATEWAY_URL}/orquestrador/enviar_mensagem_direta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent_id: clinica.agentId, numero_whatsapp: telefone, texto }),
    })
    const data = (await r.json()) as { erro?: string; whatsapp_id?: string | null }
    return { erro: data.erro ?? null, whatsappId: data.whatsapp_id ?? null }
  } catch {
    return { erro: 'Não foi possível falar com o WhatsApp agora.', whatsappId: null }
  }
}

export async function enviarMidiaPeloWhatsApp(
  clinicaId: string, telefone: string, dataBase64: string, tipo: string, nomeArquivo: string, legenda?: string,
): Promise<ResultadoEnvio> {
  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { agentId: true } })
  if (!clinica?.agentId) return { erro: 'Esta clínica ainda não tem um agente de WhatsApp vinculado.', whatsappId: null }
  try {
    const r = await fetch(`${env.GATEWAY_URL}/orquestrador/enviar_midia_direta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent_id: clinica.agentId, numero_whatsapp: telefone,
        media_base64: dataBase64, media_type: tipo, file_name: nomeArquivo, legenda: legenda ?? '',
      }),
    })
    const data = (await r.json()) as { erro?: string; whatsapp_id?: string | null }
    return { erro: data.erro ?? null, whatsappId: data.whatsapp_id ?? null }
  } catch {
    return { erro: 'Não foi possível falar com o WhatsApp agora.', whatsappId: null }
  }
}

/**
 * Lembrete automático: garante a conversa (cria se for a primeira vez),
 * manda a mensagem de verdade pelo WhatsApp e registra no Chat - mesmo
 * caminho que "Conversar no WhatsApp" (Clientes) e "Enviar parabéns"
 * (Rotina) já usam manualmente, só que disparado pelo agendador em vez
 * de um clique.
 */
export async function enviarLembrete(clinicaId: string, pacienteId: string, telefone: string, nomeContato: string, texto: string): Promise<ResultadoEnvio> {
  const telefoneNormalizado = normalizarTelefone(telefone)
  const conversa = await prisma.conversa.upsert({
    where: { clinicaId_telefone: { clinicaId, telefone: telefoneNormalizado } },
    create: { clinicaId, telefone: telefoneNormalizado, nomeContato, pacienteId },
    update: {},
  })
  const resultado = await enviarPeloWhatsApp(clinicaId, telefoneNormalizado, texto)
  await prisma.$transaction([
    prisma.mensagem.create({ data: { conversaId: conversa.id, de: 'CLINICA', texto, whatsappId: resultado.whatsappId } }),
    prisma.conversa.update({ where: { id: conversa.id }, data: { ultimaMensagemEm: new Date() } }),
  ])
  return resultado
}
