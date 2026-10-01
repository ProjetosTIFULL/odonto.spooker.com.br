import { useState } from 'react'
import { Bot, Plug, Plus, RefreshCw, Trash2, Wrench } from 'lucide-react'
import { Card } from '../../components/ui'

type Transporte = 'http' | 'sse' | 'stdio'

type ServidorMcp = {
  id: string
  nome: string
  endereco: string // URL (http/sse) ou comando (stdio)
  transporte: Transporte
  status: 'conectado' | 'erro' | 'desconectado'
  ferramentas: string[]
}

type Skill = {
  id: string
  nome: string
  descricao: string
  ferramentas: string[]
  ativa: boolean
  exigeAprovacao: boolean
}

const MODELOS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (recomendado)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (mais capaz)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (mais rápido)' },
]

const SERVIDORES_INICIAIS: ServidorMcp[] = [
  {
    id: 's1', nome: 'Odonto Portal (interno)', endereco: 'https://api.odonto.spooker.com.br/mcp', transporte: 'http', status: 'conectado',
    ferramentas: ['buscar_paciente', 'cadastrar_paciente', 'listar_horarios_livres', 'criar_consulta', 'alterar_status_consulta', 'listar_consultas'],
  },
  {
    id: 's2', nome: 'WhatsApp', endereco: 'https://whats.spooker.com.br/mcp', transporte: 'http', status: 'desconectado',
    ferramentas: ['enviar_mensagem', 'enviar_modelo', 'ler_conversa'],
  },
]

const SKILLS_INICIAIS: Skill[] = [
  { id: 'k1', nome: 'Agendar consulta', descricao: 'Consulta horários livres e marca a consulta a pedido do paciente.', ferramentas: ['buscar_paciente', 'listar_horarios_livres', 'criar_consulta'], ativa: true, exigeAprovacao: false },
  { id: 'k2', nome: 'Confirmar / cancelar consulta', descricao: 'Interpreta respostas como "SIM" ou "não vou poder" e atualiza a agenda.', ferramentas: ['listar_consultas', 'alterar_status_consulta'], ativa: true, exigeAprovacao: false },
  { id: 'k3', nome: 'Remarcar consulta', descricao: 'Sugere novos horários e move a consulta.', ferramentas: ['listar_horarios_livres', 'alterar_status_consulta', 'criar_consulta'], ativa: true, exigeAprovacao: true },
  { id: 'k4', nome: 'Pré-cadastro de paciente', descricao: 'Coleta nome, telefone e convênio de novos contatos.', ferramentas: ['cadastrar_paciente'], ativa: true, exigeAprovacao: true },
  { id: 'k5', nome: 'Dúvidas frequentes', descricao: 'Responde sobre horários, endereço, convênios e procedimentos.', ferramentas: [], ativa: true, exigeAprovacao: false },
  { id: 'k6', nome: 'Campanha de retorno', descricao: 'Envia convite para pacientes sem visita há X meses.', ferramentas: ['listar_consultas', 'enviar_modelo'], ativa: false, exigeAprovacao: true },
]

const STATUS_LABEL: Record<ServidorMcp['status'], string> = {
  conectado: 'Conectado',
  erro: 'Erro',
  desconectado: 'Desconectado',
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
      {label && <span>{label}</span>}
    </label>
  )
}

export default function McpAgente() {
  const [ativo, setAtivo] = useState(true)
  const [modelo, setModelo] = useState(MODELOS[0].id)
  const [modoAprovacao, setModoAprovacao] = useState<'por_skill' | 'sempre' | 'nunca'>('por_skill')
  const [servidores, setServidores] = useState(SERVIDORES_INICIAIS)
  const [skills, setSkills] = useState(SKILLS_INICIAIS)
  const [novo, setNovo] = useState<{ nome: string; endereco: string; transporte: Transporte } | null>(null)

  const ferramentasDisponiveis = new Set(servidores.filter((s) => s.status === 'conectado').flatMap((s) => s.ferramentas))
  const updateSkill = (id: string, patch: Partial<Skill>) => setSkills((ks) => ks.map((k) => (k.id === id ? { ...k, ...patch } : k)))

  const adicionarServidor = () => {
    if (!novo?.nome.trim() || !novo.endereco.trim()) return
    setServidores((ss) => [...ss, { id: crypto.randomUUID(), ...novo, status: 'desconectado', ferramentas: [] }])
    setNovo(null)
  }

  return (
    <div className="stack">
      <Card title="Agente de IA" action={<Toggle checked={ativo} onChange={setAtivo} label={ativo ? 'Ativo' : 'Desativado'} />}>
        <p className="muted small">
          <Bot size={14} className="inline-icon" /> O agente atende no WhatsApp e executa as skills abaixo usando as ferramentas dos servidores MCP conectados.
        </p>
        <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
          <label>Nome do agente<input className="input" defaultValue="Sofia — Assistente Clínica Sorriso" /></label>
          <label>Modelo
            <select className="input" value={modelo} onChange={(e) => setModelo(e.target.value)}>
              {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label>Aprovação humana
            <select className="input" value={modoAprovacao} onChange={(e) => setModoAprovacao(e.target.value as typeof modoAprovacao)}>
              <option value="por_skill">Definida por skill</option>
              <option value="sempre">Sempre pedir aprovação</option>
              <option value="nunca">Nunca (totalmente automático)</option>
            </select>
          </label>
          <label>Atuação
            <select className="input" defaultValue="fora_horario">
              <option value="sempre">24 horas</option>
              <option value="fora_horario">Somente fora do horário de atendimento</option>
              <option value="triagem">Triagem e depois transfere para atendente</option>
            </select>
          </label>
          <label className="span-2">Instruções do agente
            <textarea
              className="input textarea"
              rows={4}
              defaultValue={'Você é a assistente virtual da Clínica Sorriso. Seja cordial e objetiva.\nNunca dê diagnóstico ou orientação clínica; encaminhe para um dentista.\nSempre confirme data, horário e profissional antes de agendar.'}
            />
          </label>
          <div className="span-2"><button className="btn btn-primary">Salvar</button></div>
        </form>
      </Card>

      <Card
        title="Servidores MCP"
        action={<button className="btn btn-primary btn-sm" onClick={() => setNovo({ nome: '', endereco: '', transporte: 'http' })}><Plus size={16} /> Adicionar</button>}
      >
        {novo && (
          <div className="mcp-new">
            <input className="input" placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <select className="input" value={novo.transporte} onChange={(e) => setNovo({ ...novo, transporte: e.target.value as Transporte })}>
              <option value="http">HTTP (streamable)</option>
              <option value="sse">SSE</option>
              <option value="stdio">stdio</option>
            </select>
            <input
              className="input grow-input"
              placeholder={novo.transporte === 'stdio' ? 'Comando, ex: npx meu-servidor-mcp' : 'https://.../mcp'}
              value={novo.endereco}
              onChange={(e) => setNovo({ ...novo, endereco: e.target.value })}
            />
            <button className="btn btn-primary btn-sm" onClick={adicionarServidor}>Salvar</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setNovo(null)}>Cancelar</button>
          </div>
        )}
        <ul className="list">
          {servidores.map((s) => (
            <li key={s.id} className="list-row">
              <Plug size={18} className="muted" />
              <div className="grow">
                <strong>{s.nome} <span className="tag">{s.transporte}</span></strong>
                <small className="ellipsis">{s.endereco}</small>
                {s.ferramentas.length > 0 && <small>{s.ferramentas.length} ferramentas: {s.ferramentas.join(', ')}</small>}
              </div>
              <span className={`badge badge-mcp-${s.status}`}>{STATUS_LABEL[s.status]}</span>
              <button className="icon-btn" title="Testar conexão"><RefreshCw size={16} /></button>
              <button className="icon-btn" title="Remover" onClick={() => setServidores((ss) => ss.filter((x) => x.id !== s.id))}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Skills" action={<button className="btn btn-ghost btn-sm"><Plus size={16} /> Nova skill</button>}>
        <ul className="list">
          {skills.map((k) => {
            const faltando = k.ferramentas.filter((f) => !ferramentasDisponiveis.has(f))
            return (
              <li key={k.id} className="list-row">
                <Toggle checked={k.ativa} onChange={(v) => updateSkill(k.id, { ativa: v })} />
                <div className="grow">
                  <strong>{k.nome}</strong>
                  <small>{k.descricao}</small>
                  {k.ferramentas.length > 0 && (
                    <small><Wrench size={12} className="inline-icon" /> {k.ferramentas.join(', ')}</small>
                  )}
                  {faltando.length > 0 && <small className="text-danger">Ferramenta indisponível: {faltando.join(', ')}</small>}
                </div>
                <label className="check small" title="Pedir aprovação de um atendente antes de executar">
                  <input
                    type="checkbox"
                    checked={modoAprovacao === 'sempre' || (modoAprovacao === 'por_skill' && k.exigeAprovacao)}
                    disabled={modoAprovacao !== 'por_skill'}
                    onChange={(e) => updateSkill(k.id, { exigeAprovacao: e.target.checked })}
                  />
                  Exige aprovação
                </label>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
