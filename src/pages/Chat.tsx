import { useEffect, useRef, useState } from 'react'
import { Paperclip, Search, Send, Zap } from 'lucide-react'
import { Avatar } from '../components/ui'
import { api } from '../lib/api'

type Mensagem = { id: string; de: 'PACIENTE' | 'CLINICA'; texto: string; enviadaEm: string }
type ConversaResumo = {
  id: string
  telefone: string
  nomeContato: string | null
  naoLidas: number
  ultimaMensagemEm: string
  paciente: { id: string; nome: string; convenio: string | null } | null
  ultimaMensagem: Mensagem | null
}
type ConversaDetalhe = ConversaResumo & { mensagens: Mensagem[] }

const RESPOSTAS_RAPIDAS = [
  'Olá! Como podemos ajudar?',
  'Sua consulta está confirmada. Até lá! 😊',
  'Nosso horário de atendimento é de seg. a sex., das 8h às 19h.',
  'Posso te enviar os horários disponíveis para agendamento?',
]

const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const nomeDaConversa = (c: ConversaResumo) => c.paciente?.nome || c.nomeContato || c.telefone

export default function Chat() {
  const [conversas, setConversas] = useState<ConversaResumo[]>([])
  const [ativaId, setAtivaId] = useState<string | null>(null)
  const [ativa, setAtiva] = useState<ConversaDetalhe | null>(null)
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  const [mostrarRapidas, setMostrarRapidas] = useState(false)
  const intervaloLista = useRef<ReturnType<typeof setInterval>>(undefined)

  const carregarLista = () => {
    api<ConversaResumo[]>('/conversas').then((cs) => {
      setConversas(cs)
      setAtivaId((id) => id ?? cs[0]?.id ?? null)
    })
  }

  useEffect(() => {
    carregarLista()
    intervaloLista.current = setInterval(carregarLista, 5000) // pega conversa nova chegando pelo WhatsApp
    return () => clearInterval(intervaloLista.current)
  }, [])

  useEffect(() => {
    if (!ativaId) return
    const carregarAtiva = () => api<ConversaDetalhe>(`/conversas/${ativaId}`).then(setAtiva)
    carregarAtiva()
    // Sem isso, uma mensagem nova chegando na conversa JA ABERTA so aparecia
    // trocando de conversa e voltando (ou com F5) - o polling da lista ao
    // lado nao recarrega o painel central sozinho.
    const intervalo = setInterval(carregarAtiva, 3000)
    return () => clearInterval(intervalo)
  }, [ativaId])

  const abrir = (id: string) => setAtivaId(id)

  const enviar = (msg = texto) => {
    if (!msg.trim() || !ativaId) return
    api<Mensagem>(`/conversas/${ativaId}/mensagens`, { method: 'POST', body: { texto: msg } }).then((m) => {
      setAtiva((a) => (a ? { ...a, mensagens: [...a.mensagens, m] } : a))
      carregarLista()
    })
    setTexto('')
    setMostrarRapidas(false)
  }

  const filtradas = conversas.filter(
    (c) => nomeDaConversa(c).toLowerCase().includes(busca.toLowerCase()) || c.telefone.includes(busca),
  )

  if (!ativa) {
    return (
      <div className="chat card">
        <p className="muted" style={{ padding: 24 }}>
          {conversas.length === 0 ? 'Nenhuma conversa ainda — assim que o WhatsApp receber uma mensagem, ela aparece aqui.' : 'Carregando...'}
        </p>
      </div>
    )
  }

  return (
    <div className="chat card">
      <aside className="chat-list">
        <div className="chat-search">
          <Search size={16} />
          <input placeholder="Buscar conversa" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <ul>
          {filtradas.map((c) => (
            <li key={c.id} className={`chat-item ${c.id === ativaId ? 'active' : ''}`} onClick={() => abrir(c.id)}>
              <Avatar nome={nomeDaConversa(c)} />
              <div className="grow ellipsis">
                <div className="row-between">
                  <strong>{nomeDaConversa(c)}</strong>
                  <small className="muted">{c.ultimaMensagem && fmtHora(c.ultimaMensagem.enviadaEm)}</small>
                </div>
                <div className="row-between">
                  <small className="ellipsis">{c.ultimaMensagem?.texto}</small>
                  {c.naoLidas > 0 && <span className="count">{c.naoLidas}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <section className="chat-main">
        <header className="chat-header">
          <Avatar nome={nomeDaConversa(ativa)} />
          <div className="grow">
            <strong>{nomeDaConversa(ativa)}</strong>
            <small className="muted">{ativa.paciente ? `Paciente · ${ativa.paciente.convenio ?? 'particular'}` : 'Contato não cadastrado'}</small>
          </div>
        </header>

        <div className="chat-messages">
          {ativa.mensagens.map((m) => (
            <div key={m.id} className={`bubble ${m.de === 'CLINICA' ? 'out' : 'in'}`}>
              {m.texto}
              <small>{fmtHora(m.enviadaEm)}</small>
            </div>
          ))}
        </div>

        {mostrarRapidas && (
          <div className="quick-replies">
            {RESPOSTAS_RAPIDAS.map((r) => (
              <button key={r} onClick={() => enviar(r)}>{r}</button>
            ))}
          </div>
        )}

        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); enviar() }}>
          <button type="button" className="icon-btn" title="Respostas rápidas" onClick={() => setMostrarRapidas((v) => !v)}>
            <Zap size={18} />
          </button>
          <button type="button" className="icon-btn" title="Anexar"><Paperclip size={18} /></button>
          <input placeholder="Digite uma mensagem" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button type="submit" className="btn btn-primary" aria-label="Enviar"><Send size={16} /></button>
        </form>
      </section>
    </div>
  )
}
