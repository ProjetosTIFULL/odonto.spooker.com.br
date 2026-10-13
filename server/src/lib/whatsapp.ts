import { env } from '../env.ts'
import { prisma } from '../db.ts'
import { normalizarTelefone } from './http.ts'

type ResultadoEnvio = { erro: string | null; whatsappId: string | null }

/**
 * Registra a mensagem que a clínica mandou (lembrete automático, "Enviar
 * parabéns", resposta manual do atendente no Chat) no histórico de
 * conversa que a IA consulta no Orquestrador antes de responder - sem
 * isso, quando o paciente responder, a IA vê só a resposta solta (ex:
 * "sim"), sem a pergunta que a originou, e pode se perder. Best-effort:
 * nunca impede o envio da mensagem em si, só enriquece o contexto pra
 * próxima resposta da IA. Mesmo formato de role ({role, content}) que
 * message_processor.py usa pra montar o histórico de verdade.
 */
async function registrarNoHistoricoDaIA(agentId: number, telefone: string, texto: string): Promise<void> {
  const numeroWhatsapp = `${telefone}@s.whatsapp.net`
  try {
    const rConversa = await fetch(`${env.GATEWAY_URL}/orquestrador/get_conversa`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenant_id: agentId, numero_whatsapp: numeroWhatsapp }),
    })
    const conversa = (await rConversa.json()) as { mensagens?: { role: string; content: string }[] | string }
    const mensagensAtuais = typeof conversa.mensagens === 'string' ? JSON.parse(conversa.mensagens || '[]') : (conversa.mensagens ?? [])
    const mensagens = [...mensagensAtuais, { role: 'assistant', content: texto }].slice(-20)
    await fetch(`${env.GATEWAY_URL}/orquestrador/atualizar_conversa`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenant_id: agentId, numero_whatsapp: numeroWhatsapp, mensagens }),
    })
  } catch (e) {
    console.error(`[historico-ia] Não foi possível registrar mensagem no histórico da IA para ${telefone}:`, e)
  }
}

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
    if (!data.erro) await registrarNoHistoricoDaIA(clinica.agentId, telefone, texto)
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
