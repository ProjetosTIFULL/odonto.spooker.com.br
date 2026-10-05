// Criptografia simetrica (AES-256-GCM) pra guardar segredos de terceiros
// no banco (hoje: o refresh_token da Google Agenda do profissional) -
// nunca em texto puro, mesmo que alguem tenha acesso de leitura ao banco.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { env } from '../env.ts'

const chave = scryptSync(env.ENCRYPTION_KEY, 'odonto-portal-salt', 32)

/** Formato: <iv>:<authTag>:<dados>, tudo em base64. */
export function criptografar(texto: string): string {
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', chave, iv)
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return `${iv.toString('base64')}:${cifra.getAuthTag().toString('base64')}:${dados.toString('base64')}`
}

export function descriptografar(valor: string): string {
  const [ivB64, tagB64, dadosB64] = valor.split(':')
  if (!ivB64 || !tagB64 || !dadosB64) throw new Error('Valor criptografado em formato inválido')
  const decifra = createDecipheriv('aes-256-gcm', chave, Buffer.from(ivB64, 'base64'))
  decifra.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decifra.update(Buffer.from(dadosB64, 'base64')), decifra.final()]).toString('utf8')
}
