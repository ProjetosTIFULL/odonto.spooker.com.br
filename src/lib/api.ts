// Cliente da API (/api é redirecionado para o servidor pelo proxy do Vite).

const TOKEN_KEY = 'odonto.token'

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* navegação privada etc.: a sessão dura só enquanto a aba estiver aberta */
    }
  },
}

export class ApiError extends Error {
  status: number
  detalhes?: { campo: string; mensagem: string }[]
  constructor(status: number, message: string, detalhes?: ApiError['detalhes']) {
    super(message)
    this.status = status
    this.detalhes = detalhes
  }
}

/** Chamado quando a API responde 401 (token expirado, usuário desativado). */
let onUnauthorized: () => void = () => {}
export const setOnUnauthorized = (fn: () => void) => (onUnauthorized = fn)

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get()
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined && { 'content-type': 'application/json' }),
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })

  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized()
    const detalhe = data?.detalhes?.map((d: { campo: string; mensagem: string }) => `${d.campo}: ${d.mensagem}`).join(' · ')
    throw new ApiError(res.status, detalhe ? `${data.erro} — ${detalhe}` : (data?.erro ?? 'Erro de comunicação com o servidor'), data?.detalhes)
  }
  return data as T
}
