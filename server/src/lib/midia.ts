import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../env.ts'

/** mediatype que a Evolution API espera (image | video | audio | document). */
export function tipoDeMime(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'document'
}

const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/3gpp': '3gp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/webm': 'weba',
  'application/pdf': 'pdf',
}

function extensaoDeMime(mimeType: string): string {
  return EXTENSAO_POR_MIME[mimeType] ?? mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '').slice(0, 8) ?? 'bin'
}

/**
 * Salva bytes de mídia (base64) na pasta de uploads com um nome
 * aleatório (seguranca por URL "inadivinhavel", mesmo modelo que
 * WhatsApp/Telegram usam pra midia - nao precisa de autenticacao pra
 * servir, ja que a Evolution API, fora da nossa auth, tambem precisa
 * buscar esse arquivo pra enviar pelo WhatsApp).
 *
 * Devolve o caminho já pronto pro front usar direto num <img src> (o
 * mesmo prefixo /api que o resto da API usa, por causa do proxy do
 * Vite) - pro envio ao WhatsApp, urlInternaDaMidia() vira isso numa
 * URL completa que outros containers da rede compartilhada alcançam.
 */
export async function salvarMidia(dataBase64: string, mimeType: string): Promise<{ caminhoRelativo: string; tipo: string }> {
  await mkdir(env.UPLOADS_DIR, { recursive: true })
  const nomeArquivo = `${randomUUID()}.${extensaoDeMime(mimeType)}`
  await writeFile(path.join(env.UPLOADS_DIR, nomeArquivo), Buffer.from(dataBase64, 'base64'))
  return { caminhoRelativo: `/api/uploads/${nomeArquivo}`, tipo: tipoDeMime(mimeType) }
}

export function urlInternaDaMidia(caminhoRelativo: string): string {
  return `${env.INTERNAL_BASE_URL}${caminhoRelativo}`
}
