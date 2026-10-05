// Integração com a Google Agenda (OAuth por profissional + Calendar API).
// So funciona depois que GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET estiverem
// configurados (ver GoogleConfigurado abaixo) - sem isso, a conexao fica
// desligada sem travar o resto do Portal.
import { env } from '../env.ts'
import { descriptografar } from './crypto.ts'

export const GOOGLE_REDIRECT_URI = 'https://odonto.spooker.com.br/api/google/callback'
export const googleConfigurado = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

const ESCOPO = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email'

/** URL pra onde mandar o navegador do profissional - "state" carrega o id dele, pra sabermos quem está conectando quando o Google chamar nosso /callback de volta. */
export function urlDeAutorizacao(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: ESCOPO,
    access_type: 'offline', // necessario pra ganhar um refresh_token (nao so access_token)
    prompt: 'consent', // forca mostrar a tela de consentimento sempre, garantindo que ganhamos um refresh_token novo mesmo se ja tinha autorizado antes
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

type TokensGoogle = { access_token: string; refresh_token?: string; expires_in: number }

export async function trocarCodigoPorTokens(code: string): Promise<TokensGoogle> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI, grant_type: 'authorization_code',
    }),
  })
  if (!r.ok) throw new Error(`Google recusou o código de autorização: ${await r.text()}`)
  return r.json()
}

export async function buscarEmailDaConta(accessToken: string): Promise<string | null> {
  const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { authorization: `Bearer ${accessToken}` } })
  if (!r.ok) return null
  const dados = (await r.json()) as { email?: string }
  return dados.email ?? null
}

/** Troca o refresh_token (guardado criptografado) por um access_token novo - os access_tokens da Google expiram em ~1h, então sempre renova na hora de usar em vez de cachear. */
async function obterAccessToken(refreshTokenCriptografado: string): Promise<string> {
  const refreshToken = descriptografar(refreshTokenCriptografado)
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })
  if (!r.ok) throw new Error(`Não foi possível renovar o acesso à Google Agenda: ${await r.text()}`)
  const dados = (await r.json()) as { access_token: string }
  return dados.access_token
}

type EventoConsulta = { inicio: Date; fim: Date; tituloPaciente: string; descricao: string }

/** Cria o evento na Google Agenda do profissional - retorna o id do evento criado (guardar em Consulta.googleEventId). */
export async function criarEventoGoogle(refreshTokenCriptografado: string, evento: EventoConsulta): Promise<string> {
  const accessToken = await obterAccessToken(refreshTokenCriptografado)
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: evento.tituloPaciente,
      description: evento.descricao,
      start: { dateTime: evento.inicio.toISOString() },
      end: { dateTime: evento.fim.toISOString() },
    }),
  })
  if (!r.ok) throw new Error(`Google Agenda recusou criar o evento: ${await r.text()}`)
  const dados = (await r.json()) as { id: string }
  return dados.id
}

export async function atualizarEventoGoogle(refreshTokenCriptografado: string, eventoId: string, evento: EventoConsulta): Promise<void> {
  const accessToken = await obterAccessToken(refreshTokenCriptografado)
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventoId}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: evento.tituloPaciente,
      description: evento.descricao,
      start: { dateTime: evento.inicio.toISOString() },
      end: { dateTime: evento.fim.toISOString() },
    }),
  })
  if (!r.ok) throw new Error(`Google Agenda recusou atualizar o evento: ${await r.text()}`)
}

export async function excluirEventoGoogle(refreshTokenCriptografado: string, eventoId: string): Promise<void> {
  const accessToken = await obterAccessToken(refreshTokenCriptografado)
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventoId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  })
  // 410 Gone = o evento ja tinha sido apagado direto no Google - nao e erro pra nos.
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Google Agenda recusou excluir o evento: ${await r.text()}`)
}
