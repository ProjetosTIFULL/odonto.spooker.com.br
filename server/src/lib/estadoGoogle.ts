// "state" do OAuth do Google - não é um token de login (não usa o
// @fastify/jwt do resto da API, de propósito: aquele payload é
// {sub, clinicaId, papel} e aceitar esse formato ali abriria a
// possibilidade de usar esse state como se fosse um token de sessão
// de verdade). Aqui é só um HMAC curto com validade de 10 min,
// pra garantir que quem chamou /conectar foi mesmo quem o Google
// devolve em /callback.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../env.ts'

export type StatePayload = { profissionalId: string; clinicaId: string }

const VALIDADE_MS = 10 * 60_000

function assinar(dados: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(dados).digest('base64url')
}

export function gerarState(payload: StatePayload): string {
  const expira = Date.now() + VALIDADE_MS
  const dados = `${payload.profissionalId}:${payload.clinicaId}:${expira}`
  return Buffer.from(`${dados}:${assinar(dados)}`).toString('base64url')
}

export function verificarState(state: string): StatePayload {
  const partes = Buffer.from(state, 'base64url').toString('utf8').split(':')
  if (partes.length !== 4) throw new Error('state inválido')
  const [profissionalId, clinicaId, expiraStr, assinatura] = partes as [string, string, string, string]
  const esperada = Buffer.from(assinar(`${profissionalId}:${clinicaId}:${expiraStr}`))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) throw new Error('state inválido')
  if (Date.now() > Number(expiraStr)) throw new Error('state expirado')
  return { profissionalId, clinicaId }
}
