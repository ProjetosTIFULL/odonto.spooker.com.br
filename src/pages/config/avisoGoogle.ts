// Depois que a pessoa autoriza (ou recusa) no Google, o /api/google/callback
// redireciona de volta pra cá com ?google=conectado|repita|recusado|erro.
// Lido (e removido da URL) uma vez só, no carregamento da página.
const MENSAGENS: Record<string, { tipo: 'sucesso' | 'erro'; texto: string }> = {
  conectado: { tipo: 'sucesso', texto: 'Google Agenda conectada! As próximas consultas desse dentista já aparecem lá.' },
  repita: { tipo: 'erro', texto: 'O Google não confirmou a conexão dessa vez - clique em "Conectar" de novo.' },
  recusado: { tipo: 'erro', texto: 'A conexão com a Google Agenda foi cancelada.' },
  erro: { tipo: 'erro', texto: 'Não foi possível conectar com a Google Agenda agora. Tente de novo em instantes.' },
}

export function avisoConexaoGoogle(): { tipo: 'sucesso' | 'erro'; texto: string } | null {
  const params = new URLSearchParams(window.location.search)
  const valor = params.get('google')
  if (!valor) return null
  window.history.replaceState(null, '', window.location.pathname)
  return MENSAGENS[valor] ?? null
}
