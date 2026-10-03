import { useEffect, useRef, useState } from 'react'
import { Check, CheckCheck, Clock, FileText, Paperclip, Search, Send, X, Zap } from 'lucide-react'
import { Avatar } from '../components/ui'
import { api } from '../lib/api'

type StatusMensagem = 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHOU'
type Mensagem = {
  id: string
  de: 'PACIENTE' | 'CLINICA'
  texto: string | null
  midiaUrl: string | null
  midiaTipo: string | null
  status: StatusMensagem
  enviadaEm: string
}
type ConversaResumo = {
  id: string
  telefone: string
  nomeContato: string | null
  fotoUrl: string | null
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

// Tamanho maximo de anexo - mesma folga que o backend aceita (bodyLimit
// 25MB pro JSON com base64, que tem ~33% de overhead sobre o arquivo).
const TAMANHO_MAXIMO_ANEXO = 18 * 1024 * 1024

const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const nomeDaConversa = (c: ConversaResumo) => c.paciente?.nome || c.nomeContato || c.telefone
const previaMensagem = (m: Mensagem | null) => {
  if (!m) return ''
  if (m.midiaTipo === 'image') return '📷 Foto'
  if (m.midiaTipo === 'video') return '🎥 Vídeo'
  if (m.midiaTipo === 'audio') return '🎵 Áudio'
  if (m.midiaTipo) return '📄 Documento'
  return m.texto ?? ''
}

function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve((leitor.result as string).split(',')[1] ?? '')
    leitor.onerror = reject
    leitor.readAsDataURL(file)
  })
}

/** Tiquinhos de status, igual ao WhatsApp - só faz sentido pra mensagens CLINICA. */
function IconeStatus({ status }: { status: StatusMensagem }) {
  if (status === 'LIDA') return <CheckCheck size={14} className="status-lida" />
  if (status === 'ENTREGUE') return <CheckCheck size={14} />
  if (status === 'FALHOU') return <Clock size={14} />
  return <Check size={14} />
}

function ConteudoMensagem({ m }: { m: Mensagem }) {
  if (m.midiaTipo === 'image' && m.midiaUrl) {
    return (
      <>
        <img src={m.midiaUrl} alt={m.texto ?? 'Foto'} className="bubble-media" />
        {m.texto && <div className="bubble-caption">{m.texto}</div>}
      </>
    )
  }
  if (m.midiaTipo === 'video' && m.midiaUrl) {
    return (
      <>
        <video src={m.midiaUrl} controls className="bubble-media" />
        {m.texto && <div className="bubble-caption">{m.texto}</div>}
      </>
    )
  }
  if (m.midiaTipo === 'audio' && m.midiaUrl) {
    return <audio src={m.midiaUrl} controls className="bubble-audio" />
  }
  if (m.midiaUrl) {
    return (
      <a href={m.midiaUrl} target="_blank" rel="noreferrer" className="bubble-doc">
        <FileText size={20} /> {m.texto || 'Documento'}
      </a>
    )
  }
  return <>{m.texto}</>
}

export default function Chat() {
  const [conversas, setConversas] = useState<ConversaResumo[]>([])
  const [ativaId, setAtivaId] = useState<string | null>(null)
  const [ativa, setAtiva] = useState<ConversaDetalhe | null>(null)
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  const [mostrarRapidas, setMostrarRapidas] = useState(false)
  const [anexo, setAnexo] = useState<{ file: File; preview: string } | null>(null)
  const [enviandoAnexo, setEnviandoAnexo] = useState(false)
  const intervaloLista = useRef<ReturnType<typeof setInterval>>(undefined)
  const fimDasMensagens = useRef<HTMLDivElement>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

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
    const carregarAtiva = (atualizarFoto = false) =>
      api<ConversaDetalhe>(`/conversas/${ativaId}${atualizarFoto ? '?atualizarFoto=1' : ''}`).then(setAtiva)
    carregarAtiva(true) // so na abertura de verdade busca a foto de perfil de novo (igual WhatsApp Web)
    // Sem isso, uma mensagem nova (ou status de entrega/leitura) chegando
    // na conversa JA ABERTA so aparecia trocando de conversa e voltando
    // (ou com F5) - o polling da lista ao lado nao recarrega o painel
    // central sozinho.
    const intervalo = setInterval(() => carregarAtiva(false), 3000)
    return () => clearInterval(intervalo)
  }, [ativaId])

  useEffect(() => {
    fimDasMensagens.current?.scrollIntoView({ block: 'end' })
  }, [ativa?.mensagens])

  useEffect(() => {
    return () => {
      if (anexo) URL.revokeObjectURL(anexo.preview)
    }
  }, [anexo])

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

  const escolherArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > TAMANHO_MAXIMO_ANEXO) {
      alert('Arquivo muito grande (máximo 18MB).')
      return
    }
    setAnexo({ file, preview: URL.createObjectURL(file) })
  }

  const enviarAnexo = async () => {
    if (!anexo || !ativaId) return
    setEnviandoAnexo(true)
    try {
      const dataBase64 = await arquivoParaBase64(anexo.file)
      const m = await api<Mensagem>(`/conversas/${ativaId}/midia`, {
        method: 'POST',
        body: { dataBase64, mimeType: anexo.file.type || 'application/octet-stream', nomeArquivo: anexo.file.name, legenda: texto.trim() || undefined },
      })
      setAtiva((a) => (a ? { ...a, mensagens: [...a.mensagens, m] } : a))
      carregarLista()
      URL.revokeObjectURL(anexo.preview)
      setAnexo(null)
      setTexto('')
    } finally {
      setEnviandoAnexo(false)
    }
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
              <Avatar nome={nomeDaConversa(c)} fotoUrl={c.fotoUrl} />
              <div className="grow ellipsis">
                <div className="row-between">
                  <strong>{nomeDaConversa(c)}</strong>
                  <small className="muted">{c.ultimaMensagem && fmtHora(c.ultimaMensagem.enviadaEm)}</small>
                </div>
                <div className="row-between">
                  <small className="ellipsis">{previaMensagem(c.ultimaMensagem)}</small>
                  {c.naoLidas > 0 && <span className="count">{c.naoLidas}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <section className="chat-main">
        <header className="chat-header">
          <Avatar nome={nomeDaConversa(ativa)} fotoUrl={ativa.fotoUrl} />
          <div className="grow">
            <strong>{nomeDaConversa(ativa)}</strong>
            <small className="muted">{ativa.paciente ? `Paciente · ${ativa.paciente.convenio ?? 'particular'}` : 'Contato não cadastrado'}</small>
          </div>
        </header>

        <div className="chat-messages">
          {ativa.mensagens.map((m) => (
            <div key={m.id} className={`bubble ${m.de === 'CLINICA' ? 'out' : 'in'}`}>
              <ConteudoMensagem m={m} />
              <small className="bubble-meta">
                {fmtHora(m.enviadaEm)}
                {m.de === 'CLINICA' && <IconeStatus status={m.status} />}
              </small>
            </div>
          ))}
          <div ref={fimDasMensagens} />
        </div>

        {mostrarRapidas && (
          <div className="quick-replies">
            {RESPOSTAS_RAPIDAS.map((r) => (
              <button key={r} onClick={() => enviar(r)}>{r}</button>
            ))}
          </div>
        )}

        {anexo && (
          <div className="attachment-preview">
            {anexo.file.type.startsWith('image/') ? (
              <img src={anexo.preview} alt="" />
            ) : anexo.file.type.startsWith('video/') ? (
              <video src={anexo.preview} />
            ) : (
              <div className="attachment-preview-doc"><FileText size={20} /> {anexo.file.name}</div>
            )}
            <input
              placeholder="Adicionar legenda (opcional)"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enviarAnexo()}
            />
            <button type="button" className="icon-btn" title="Cancelar" onClick={() => { URL.revokeObjectURL(anexo.preview); setAnexo(null) }}>
              <X size={18} />
            </button>
            <button type="button" className="btn btn-primary" disabled={enviandoAnexo} onClick={enviarAnexo}>
              <Send size={16} />
            </button>
          </div>
        )}

        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); enviar() }}>
          <button type="button" className="icon-btn" title="Respostas rápidas" onClick={() => setMostrarRapidas((v) => !v)}>
            <Zap size={18} />
          </button>
          <input ref={inputArquivo} type="file" accept="image/*,video/*,audio/*,.pdf" hidden onChange={escolherArquivo} />
          <button type="button" className="icon-btn" title="Anexar" onClick={() => inputArquivo.current?.click()}>
            <Paperclip size={18} />
          </button>
          <input placeholder="Digite uma mensagem" value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!!anexo} />
          <button type="submit" className="btn btn-primary" aria-label="Enviar" disabled={!!anexo}><Send size={16} /></button>
        </form>
      </section>
    </div>
  )
}
