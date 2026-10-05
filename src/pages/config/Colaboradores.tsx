import { useCallback, useEffect, useState } from 'react'
import { CalendarCheck2, KeyRound, Pencil, Plus } from 'lucide-react'
import { useUsuario } from '../../auth/AuthContext'
import { FUNCAO_LABEL, PAPEL_LABEL, type FuncaoColaborador } from '../../auth/permissoes'
import { Avatar, Card, Modal } from '../../components/ui'
import { api } from '../../lib/api'
import type { Colaborador } from './tipos'
import { UsuarioModal } from './Usuarios'

type Filtro = 'todos' | FuncaoColaborador

export default function Colaboradores() {
  const usuario = useUsuario()
  const [lista, setLista] = useState<Colaborador[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [editando, setEditando] = useState<Colaborador | 'novo' | null>(null)
  const [criandoLogin, setCriandoLogin] = useState<Colaborador | null>(null)
  const [mexendoGoogle, setMexendoGoogle] = useState<string | null>(null)

  const carregar = useCallback(() => {
    api<Colaborador[]>('/profissionais?todos=true').then(setLista).catch((e) => setErro(e.message))
  }, [])
  useEffect(carregar, [carregar])

  /** ADMIN mexe na agenda de qualquer dentista; o próprio dentista só na dele. */
  const podeMexerGoogle = (c: Colaborador) => usuario.papel === 'ADMIN' || usuario.profissional?.id === c.id

  const conectarGoogle = async (c: Colaborador) => {
    setMexendoGoogle(c.id)
    try {
      const { url } = await api<{ url: string }>(`/google/conectar/${c.id}`)
      window.location.href = url
    } catch (e) {
      setErro((e as Error).message)
      setMexendoGoogle(null)
    }
  }

  const desconectarGoogle = async (c: Colaborador) => {
    if (!confirm(`Desconectar a Google Agenda de ${c.nome}? As consultas vão continuar só no Portal.`)) return
    setMexendoGoogle(c.id)
    try {
      await api(`/google/desconectar/${c.id}`, { method: 'POST' })
      carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setMexendoGoogle(null)
    }
  }

  const visiveis = lista.filter((c) => filtro === 'todos' || c.funcao === filtro)

  return (
    <Card
      title="Profissionais e colaboradores"
      action={<button className="btn btn-primary btn-sm" onClick={() => setEditando('novo')}><Plus size={16} /> Adicionar</button>}
    >
      <p className="muted small">
        Todas as pessoas da clínica. Só quem tem a função <b>Dentista / Médico</b> aparece como coluna na agenda.
        O acesso ao sistema (login e perfil) é criado em <b>Usuários e permissões</b> ou pelo botão de chave.
      </p>

      <div className="segmented filtro-colab">
        {(['todos', 'DENTISTA', 'SECRETARIO'] as const).map((f) => (
          <button key={f} className={filtro === f ? 'active' : ''} onClick={() => setFiltro(f)}>
            {f === 'todos' ? 'Todos' : FUNCAO_LABEL[f]}
          </button>
        ))}
      </div>

      {erro && <p className="text-danger small">{erro}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Função</th>
              <th>Contato</th>
              <th>Acesso ao sistema</th>
              <th>Agenda Google</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((c) => (
              <tr key={c.id} className={c.ativo ? '' : 'is-inativo'}>
                <td>
                  <div className="cell-user">
                    <Avatar nome={c.nome} cor={c.funcao === 'DENTISTA' ? c.cor : undefined} />
                    <div>
                      <strong>{c.nome}</strong>
                      <small className="muted">{[c.especialidade, c.cro, !c.ativo && 'Inativo'].filter(Boolean).join(' · ')}</small>
                    </div>
                  </div>
                </td>
                <td><span className={`badge badge-funcao-${c.funcao}`}>{FUNCAO_LABEL[c.funcao]}</span></td>
                <td>
                  <div className="cell-stack">
                    <span>{c.telefone ?? '—'}</span>
                    {c.email && <small className="muted">{c.email}</small>}
                  </div>
                </td>
                <td>
                  {c.usuario ? (
                    <div className="cell-stack">
                      <span>{c.usuario.email}</span>
                      <small className="muted">{PAPEL_LABEL[c.usuario.papel]}{c.usuario.ativo ? '' : ' · desativado'}</small>
                    </div>
                  ) : (
                    <span className="muted">Sem login</span>
                  )}
                </td>
                <td>
                  {c.funcao !== 'DENTISTA' ? (
                    <span className="muted">—</span>
                  ) : c.googleEmail ? (
                    <div className="cell-stack">
                      <span className="google-conectado"><CalendarCheck2 size={14} /> Conectado</span>
                      <small className="muted">{c.googleEmail}</small>
                      {podeMexerGoogle(c) && (
                        <button type="button" className="link-btn small" disabled={mexendoGoogle === c.id} onClick={() => desconectarGoogle(c)}>
                          Desconectar
                        </button>
                      )}
                    </div>
                  ) : podeMexerGoogle(c) ? (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={mexendoGoogle === c.id} onClick={() => conectarGoogle(c)}>
                      {mexendoGoogle === c.id ? 'Abrindo...' : 'Conectar'}
                    </button>
                  ) : (
                    <span className="muted">Não conectada</span>
                  )}
                </td>
                <td className="cell-actions">
                  {!c.usuario && c.ativo && (
                    <button className="icon-btn" title="Criar login para este colaborador" onClick={() => setCriandoLogin(c)}>
                      <KeyRound size={16} />
                    </button>
                  )}
                  <button className="icon-btn" title="Editar" onClick={() => setEditando(c)}><Pencil size={16} /></button>
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr><td colSpan={6} className="empty">Nenhum colaborador.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editando && (
        <ColaboradorModal
          colaborador={editando === 'novo' ? null : editando}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            carregar()
          }}
        />
      )}
      {criandoLogin && (
        <UsuarioModal
          usuario={null}
          colaboradores={lista}
          colaboradorInicial={criandoLogin}
          onClose={() => setCriandoLogin(null)}
          onSalvo={() => {
            setCriandoLogin(null)
            carregar()
          }}
        />
      )}
    </Card>
  )
}

const CORES = ['#0e7c86', '#7c4dff', '#e8710a', '#d93b3b', '#1e9e5a', '#2a62d6', '#c2185b', '#6d4c41']

function ColaboradorModal({ colaborador, onClose, onSalvo }: { colaborador: Colaborador | null; onClose: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    nome: colaborador?.nome ?? '',
    funcao: colaborador?.funcao ?? ('DENTISTA' as FuncaoColaborador),
    especialidade: colaborador?.especialidade ?? '',
    cro: colaborador?.cro ?? '',
    telefone: colaborador?.telefone ?? '',
    email: colaborador?.email ?? '',
    cor: colaborador?.cor ?? CORES[0],
    ativo: colaborador?.ativo ?? true,
  })
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))
  const dentista = f.funcao === 'DENTISTA'

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    const vazioNull = (s: string) => s.trim() || null
    const body = {
      nome: f.nome.trim(),
      funcao: f.funcao,
      telefone: vazioNull(f.telefone),
      email: vazioNull(f.email),
      ativo: f.ativo,
      // Especialidade, CRO e cor só fazem sentido para quem atende
      especialidade: dentista ? vazioNull(f.especialidade) : null,
      cro: dentista ? vazioNull(f.cro) : null,
      ...(dentista && { cor: f.cor }),
    }
    try {
      await api(colaborador ? `/profissionais/${colaborador.id}` : '/profissionais', { method: colaborador ? 'PUT' : 'POST', body })
      onSalvo()
    } catch (err) {
      setErro((err as Error).message)
      setSalvando(false)
    }
  }

  return (
    <Modal title={colaborador ? 'Editar colaborador' : 'Novo colaborador'} onClose={onClose}>
      <form className="form-grid" onSubmit={salvar}>
        <label className="span-2">Nome<input className="input" required minLength={2} value={f.nome} onChange={(e) => set('nome', e.target.value)} /></label>
        <label className="span-2">Função
          <select className="input" value={f.funcao} onChange={(e) => set('funcao', e.target.value as FuncaoColaborador)}>
            <option value="DENTISTA">{FUNCAO_LABEL.DENTISTA} — atende e aparece na agenda</option>
            <option value="SECRETARIO">{FUNCAO_LABEL.SECRETARIO} — recepção, agendamentos, atendimento</option>
          </select>
        </label>
        {dentista && (
          <>
            <label>Especialidade<input className="input" value={f.especialidade} onChange={(e) => set('especialidade', e.target.value)} /></label>
            <label>CRO / CRM<input className="input" placeholder="CRO-RS 00000" value={f.cro} onChange={(e) => set('cro', e.target.value)} /></label>
            <div className="span-2">
              <span className="field-label">Cor na agenda</span>
              <div className="color-pick">
                {CORES.map((c) => (
                  <button key={c} type="button" className={f.cor === c ? 'active' : ''} style={{ background: c }} onClick={() => set('cor', c)} aria-label={`Cor ${c}`} />
                ))}
              </div>
            </div>
          </>
        )}
        <label>Telefone<input className="input" value={f.telefone} onChange={(e) => set('telefone', e.target.value)} /></label>
        <label>E-mail<input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
        {colaborador && (
          <label className="check span-2">
            <input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} />
            Ativo (desmarque quando a pessoa sair da clínica; o histórico é mantido)
          </label>
        )}
        {erro && <p className="text-danger small span-2">{erro}</p>}
        <div className="span-2 modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  )
}
