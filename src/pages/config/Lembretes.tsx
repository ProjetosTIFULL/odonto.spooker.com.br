import { useEffect, useState } from 'react'
import { Card } from '../../components/ui'
import { api, ApiError } from '../../lib/api'

type LembretesApi = {
  lembreteConfirmacao24hAtivo: boolean
  lembreteConfirmacao24hMensagem: string
  lembreteDiaConsultaAtivo: boolean
  lembreteDiaConsultaMensagem: string
  lembreteAniversarioAtivo: boolean
  lembreteAniversarioMensagem: string
  lembreteRetornoAtivo: boolean
  lembreteRetornoMensagem: string
  lembreteRetornoMesesLimite: number
  lembretePesquisaSatisfacaoAtivo: boolean
  lembretePesquisaSatisfacaoMensagem: string
}

const TIPOS: {
  chaveAtivo: keyof LembretesApi
  chaveMensagem: keyof LembretesApi
  titulo: string
  descricao: string
  placeholders: string
}[] = [
  {
    chaveAtivo: 'lembreteConfirmacao24hAtivo', chaveMensagem: 'lembreteConfirmacao24hMensagem',
    titulo: 'Confirmação de consulta 24h antes',
    descricao: 'Manda um dia antes, pra paciente confirmar ou avisar que não vai poder.',
    placeholders: '{nome} e {hora} disponíveis',
  },
  {
    chaveAtivo: 'lembreteDiaConsultaAtivo', chaveMensagem: 'lembreteDiaConsultaMensagem',
    titulo: 'Lembrete no dia da consulta',
    descricao: 'Manda na manhã do próprio dia da consulta.',
    placeholders: '{nome} e {hora} disponíveis',
  },
  {
    chaveAtivo: 'lembreteAniversarioAtivo', chaveMensagem: 'lembreteAniversarioMensagem',
    titulo: 'Parabéns de aniversário',
    descricao: 'Manda automaticamente no dia do aniversário do paciente.',
    placeholders: '{nome} disponível',
  },
  {
    chaveAtivo: 'lembreteRetornoAtivo', chaveMensagem: 'lembreteRetornoMensagem',
    titulo: 'Campanha de retorno',
    descricao: 'Manda pra quem não tem visita concluída há um tempo (configurável ao lado).',
    placeholders: '{nome} disponível',
  },
  {
    chaveAtivo: 'lembretePesquisaSatisfacaoAtivo', chaveMensagem: 'lembretePesquisaSatisfacaoMensagem',
    titulo: 'Pesquisa de satisfação',
    descricao: 'Manda logo depois que a consulta é marcada como concluída.',
    placeholders: '{nome} disponível',
  },
]

export default function Lembretes() {
  const [dados, setDados] = useState<LembretesApi | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  useEffect(() => {
    api<LembretesApi>('/clinica/lembretes').then(setDados).catch((e) => setErro(e.message))
  }, [])

  const set = <K extends keyof LembretesApi>(chave: K, valor: LembretesApi[K]) =>
    setDados((d) => (d ? { ...d, [chave]: valor } : d))

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dados) return
    setSalvando(true)
    setErro(null)
    try {
      setDados(await api<LembretesApi>('/clinica/lembretes', { method: 'PUT', body: dados }))
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2000)
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  if (!dados) return <Card title="Lembretes automáticos">{erro ? <p className="text-danger small">{erro}</p> : <p className="muted">Carregando...</p>}</Card>

  return (
    <Card title="Lembretes automáticos">
      <p className="muted small" style={{ marginBottom: 16 }}>
        Cada lembrete sai sozinho pelo WhatsApp, sem precisar de ninguém clicar — por isso todos começam desligados.
        Use <code>{'{nome}'}</code> e, quando disponível, <code>{'{hora}'}</code> na mensagem; são trocados pelo valor real na hora do envio.
      </p>
      <form onSubmit={salvar} className="stack">
        {TIPOS.map((t) => (
          <div key={t.chaveAtivo} className="lembrete-item">
            <label className="check">
              <input type="checkbox" checked={dados[t.chaveAtivo] as boolean} onChange={(e) => set(t.chaveAtivo, e.target.checked)} />
              <strong>{t.titulo}</strong>
            </label>
            <small className="muted">{t.descricao}</small>
            <textarea
              className="input textarea"
              rows={2}
              disabled={!dados[t.chaveAtivo]}
              value={dados[t.chaveMensagem] as string}
              onChange={(e) => set(t.chaveMensagem, e.target.value)}
            />
            <small className="muted">{t.placeholders}</small>
            {t.chaveAtivo === 'lembreteRetornoAtivo' && (
              <label className="span-2" style={{ maxWidth: 220 }}>
                Meses sem visita pra entrar na campanha
                <input
                  type="number" className="input" min={1} max={36}
                  disabled={!dados.lembreteRetornoAtivo}
                  value={dados.lembreteRetornoMesesLimite}
                  onChange={(e) => set('lembreteRetornoMesesLimite', Number(e.target.value))}
                />
              </label>
            )}
          </div>
        ))}
        {erro && <p className="text-danger small">{erro}</p>}
        <div>
          <button className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando...' : salvo ? 'Salvo!' : 'Salvar'}</button>
        </div>
      </form>
    </Card>
  )
}
