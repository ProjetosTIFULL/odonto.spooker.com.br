import { useEffect, useState } from 'react'
import { Bot, Pause, Play, Plug } from 'lucide-react'
import { Card } from '../../components/ui'
import { api, ApiError } from '../../lib/api'

type AgenteApi = {
  id: number
  name: string
  system_prompt: string | null
  ai_paused: boolean
  settings: { ai_provider?: string; ai_model?: string; nicho?: string; mcp_url?: string }
}

export default function McpAgente() {
  const [agente, setAgente] = useState<AgenteApi | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [instrucoes, setInstrucoes] = useState('')
  const [provider, setProvider] = useState<'groq' | 'anthropic'>('groq')
  const [modelo, setModelo] = useState('')
  const [nicho, setNicho] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [alternandoPausa, setAlternandoPausa] = useState(false)

  const carregar = () =>
    api<AgenteApi>('/agente')
      .then((a) => {
        setAgente(a)
        setNome(a.name)
        setInstrucoes(a.system_prompt ?? '')
        setProvider(a.settings.ai_provider === 'anthropic' ? 'anthropic' : 'groq')
        setModelo(a.settings.ai_model ?? '')
        setNicho(a.settings.nicho ?? '')
        setErroCarga(null)
      })
      .catch((e) => setErroCarga(e.message))

  useEffect(() => {
    carregar()
  }, [])

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      await api('/agente', {
        method: 'PUT',
        body: { name: nome, system_prompt: instrucoes || null, ai_provider: provider, ai_model: modelo, nicho: nicho || null },
      })
      await carregar()
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2000)
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  const alternarPausa = async () => {
    if (!agente) return
    setAlternandoPausa(true)
    try {
      await api(`/agente/${agente.ai_paused ? 'retomar' : 'pausar'}`, { method: 'POST' })
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setAlternandoPausa(false)
    }
  }

  if (erroCarga) return <Card title="Agente de IA"><p className="text-danger small">{erroCarga}</p></Card>
  if (!agente) return <Card title="Agente de IA"><p className="muted">Carregando...</p></Card>

  return (
    <div className="stack">
      <Card
        title="Agente de IA"
        action={
          <button type="button" className={`btn btn-sm ${agente.ai_paused ? 'btn-primary' : 'btn-ghost'}`} disabled={alternandoPausa} onClick={alternarPausa}>
            {agente.ai_paused ? <><Play size={14} /> Retomar</> : <><Pause size={14} /> Pausar</>}
          </button>
        }
      >
        <p className="muted small">
          <Bot size={14} className="inline-icon" /> {agente.ai_paused ? 'A IA está pausada - ninguém recebe resposta automática agora.' : 'A IA está ativa e respondendo no WhatsApp.'}
        </p>
        <form className="form-grid" onSubmit={salvar}>
          <label>Nome do agente<input className="input" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label>Provedor de IA
            <select className="input" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
              <option value="groq">Groq</option>
              <option value="anthropic">Anthropic (Claude)</option>
            </select>
          </label>
          <label className="span-2">Modelo
            <input className="input" placeholder={provider === 'anthropic' ? 'claude-sonnet-4-6' : 'openai/gpt-oss-20b'} value={modelo} onChange={(e) => setModelo(e.target.value)} />
          </label>
          <label className="span-2">Assunto da clínica (nicho)
            <textarea
              className="input textarea" rows={2}
              placeholder="Ex: clínica odontológica, atende convênios X e Y, especialidade em ortodontia..."
              value={nicho} onChange={(e) => setNicho(e.target.value)}
            />
            <small className="muted">A IA só fala sobre esse assunto - qualquer outra pergunta ela recusa educadamente.</small>
          </label>
          <label className="span-2">Instruções do agente
            <textarea className="input textarea" rows={4} value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} />
          </label>
          {erro && <p className="text-danger small span-2">{erro}</p>}
          <div className="span-2"><button className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando...' : salvo ? 'Salvo!' : 'Salvar'}</button></div>
        </form>
      </Card>

      <Card title="Servidor MCP">
        <p className="muted small" style={{ marginBottom: 0 }}>
          <Plug size={14} className="inline-icon" /> {agente.settings.mcp_url
            ? 'Ligado ao MCP de Odontologia (dados reais da clínica: profissionais, horários, catálogo, pacientes).'
            : 'Ainda não ligado a um MCP próprio - fale com o suporte Spooker.'}
        </p>
        <p className="muted small" style={{ marginTop: 8 }}>
          Por segurança, qual servidor MCP a IA usa é configurado pela equipe Spooker, não pelo cliente final - evita que a IA que fala com seus pacientes fique exposta a um servidor de terceiros.
        </p>
      </Card>
    </div>
  )
}
