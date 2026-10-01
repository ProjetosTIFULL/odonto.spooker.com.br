import { useState } from 'react'
import { CalendarPlus, Paperclip, Search, Send, UserPlus, Zap } from 'lucide-react'
import { Avatar } from '../components/ui'
import { conversas as mockConversas, getPaciente, type Conversa } from '../data/mock'

const RESPOSTAS_RAPIDAS = [
  'Olá! Como podemos ajudar?',
  'Sua consulta está confirmada. Até lá! 😊',
  'Nosso horário de atendimento é de seg. a sex., das 8h às 19h.',
  'Posso te enviar os horários disponíveis para agendamento?',
]

export default function Chat() {
  const [conversas, setConversas] = useState<Conversa[]>(mockConversas)
  const [ativaId, setAtivaId] = useState(conversas[0].id)
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  const [mostrarRapidas, setMostrarRapidas] = useState(false)

  const ativa = conversas.find((c) => c.id === ativaId)!
  const paciente = getPaciente(ativa.pacienteId)
  const filtradas = conversas.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()) || c.telefone.includes(busca))

  const abrir = (id: string) => {
    setAtivaId(id)
    setConversas((cs) => cs.map((c) => (c.id === id ? { ...c, naoLidas: 0 } : c)))
  }

  const enviar = (msg = texto) => {
    if (!msg.trim()) return
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    setConversas((cs) =>
      cs.map((c) =>
        c.id === ativaId
          ? { ...c, ultimaMensagem: msg, hora, mensagens: [...c.mensagens, { de: 'clinica', texto: msg, hora }] }
          : c,
      ),
    )
    setTexto('')
    setMostrarRapidas(false)
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
              <Avatar nome={c.nome.startsWith('+') ? '?' : c.nome} />
              <div className="grow ellipsis">
                <div className="row-between">
                  <strong>{c.nome}</strong>
                  <small className="muted">{c.hora}</small>
                </div>
                <div className="row-between">
                  <small className="ellipsis">{c.ultimaMensagem}</small>
                  {c.naoLidas > 0 && <span className="count">{c.naoLidas}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <section className="chat-main">
        <header className="chat-header">
          <Avatar nome={ativa.nome.startsWith('+') ? '?' : ativa.nome} />
          <div className="grow">
            <strong>{ativa.nome}</strong>
            <small className="muted">{paciente ? `Paciente · ${paciente.convenio}` : 'Contato não cadastrado'}</small>
          </div>
          {!paciente && <button className="btn btn-ghost btn-sm"><UserPlus size={16} /> Cadastrar</button>}
          <button className="btn btn-ghost btn-sm"><CalendarPlus size={16} /> Agendar</button>
        </header>

        <div className="chat-messages">
          {ativa.mensagens.map((m, i) => (
            <div key={i} className={`bubble ${m.de === 'clinica' ? 'out' : 'in'}`}>
              {m.texto}
              <small>{m.hora}</small>
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
