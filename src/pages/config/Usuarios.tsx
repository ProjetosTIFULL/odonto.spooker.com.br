import { useCallback, useEffect, useState } from 'react'
import { Check, Pencil, Plus, X } from 'lucide-react'
import { useUsuario } from '../../auth/AuthContext'
import { FUNCAO_LABEL, PAPEL_DESCRICAO, PAPEL_LABEL, PAPEL_POR_FUNCAO, podeAcessar, type Modulo, type Papel } from '../../auth/permissoes'
import { Card, Modal } from '../../components/ui'
import { api } from '../../lib/api'
import type { Colaborador, UsuarioClinica } from './tipos'

const PAPEIS: Papel[] = ['ADMIN', 'OPERADOR', 'DENTISTA']
const MODULOS: [Modulo, string][] = [
  ['dashboard', 'Dashboard'],
  ['agenda', 'Agenda'],
  ['chat', 'Chat'],
  ['clientes', 'Clientes'],
  ['configuracoes', 'Configurações'],
]

export default function Usuarios() {
  const eu = useUsuario()
  const [usuarios, setUsuarios] = useState<UsuarioClinica[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<UsuarioClinica | 'novo' | null>(null)

  const carregar = useCallback(() => {
    Promise.all([api<UsuarioClinica[]>('/usuarios'), api<Colaborador[]>('/profissionais?todos=true')])
      .then(([u, c]) => {
        setUsuarios(u)
        setColaboradores(c)
      })
      .catch((e) => setErro(e.message))
  }, [])
  useEffect(carregar, [carregar])

  return (
    <div className="stack">
      <Card
        title="Usuários e permissões"
        action={<button className="btn btn-primary btn-sm" onClick={() => setEditando('novo')}><Plus size={16} /> Novo usuário</button>}
      >
        <p className="muted small">Cada usuário entra com e-mail e senha. Vincule ao colaborador correspondente em Profissionais e colaboradores.</p>
        {erro && <p className="text-danger small">{erro}</p>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Colaborador</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={u.ativo ? '' : 'is-inativo'}>
                  <td>
                    <div className="cell-stack">
                      <strong>{u.nome}{u.id === eu.id && <span className="tag">você</span>}</strong>
                      <small className="muted">{u.email}</small>
                    </div>
                  </td>
                  <td><span className={`badge badge-papel-${u.papel}`}>{PAPEL_LABEL[u.papel]}</span></td>
                  <td>
                    {u.profissional ? (
                      <div className="cell-stack">
                        <span>{u.profissional.nome}</span>
                        <small className="muted">{FUNCAO_LABEL[u.profissional.funcao]}</small>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{u.ativo ? <span className="badge badge-confirmada">Ativo</span> : <span className="badge">Desativado</span>}</td>
                  <td className="cell-actions">
                    <button className="icon-btn" title="Editar" onClick={() => setEditando(u)}><Pencil size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="O que cada perfil acessa">
        <div className="table-wrap">
          <table className="table matriz">
            <thead>
              <tr>
                <th>Perfil</th>
                {MODULOS.map(([, label]) => <th key={label}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {PAPEIS.map((p) => (
                <tr key={p}>
                  <td>
                    <div className="cell-stack">
                      <strong>{PAPEL_LABEL[p]}</strong>
                      <small className="muted">{PAPEL_DESCRICAO[p]}</small>
                    </div>
                  </td>
                  {MODULOS.map(([m]) => (
                    <td key={m} className="matriz-cel">
                      {podeAcessar(p, m) ? <Check size={18} className="text-success" aria-label="sim" /> : <X size={18} className="muted" aria-label="não" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editando && (
        <UsuarioModal
          usuario={editando === 'novo' ? null : editando}
          colaboradores={colaboradores}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            carregar()
          }}
        />
      )}
    </div>
  )
}

/** Criar/editar login. Também usado em Profissionais e colaboradores ("criar login"). */
export function UsuarioModal({
  usuario,
  colaboradores,
  colaboradorInicial,
  onClose,
  onSalvo,
}: {
  usuario: UsuarioClinica | null
  colaboradores: Colaborador[]
  colaboradorInicial?: Colaborador
  onClose: () => void
  onSalvo: () => void
}) {
  const eu = useUsuario()
  const souEu = usuario?.id === eu.id
  const inicial = colaboradorInicial
  const [f, setF] = useState({
    nome: usuario?.nome ?? inicial?.nome ?? '',
    email: usuario?.email ?? inicial?.email ?? '',
    senha: '',
    papel: usuario?.papel ?? (inicial ? PAPEL_POR_FUNCAO[inicial.funcao] : ('OPERADOR' as Papel)),
    profissionalId: usuario?.profissional?.id ?? inicial?.id ?? '',
    ativo: usuario?.ativo ?? true,
  })
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))

  // Colaboradores ativos sem login (ou o já vinculado a este usuário)
  const disponiveis = colaboradores.filter((c) => c.ativo && (!c.usuario || c.usuario.id === usuario?.id))

  const escolherColaborador = (id: string) => {
    const c = colaboradores.find((x) => x.id === id)
    setF((s) => ({
      ...s,
      profissionalId: id,
      // Ao criar, preenche a partir do colaborador e sugere o perfil pela função
      ...(!usuario && c && { nome: s.nome || c.nome, email: s.email || c.email || '', papel: PAPEL_POR_FUNCAO[c.funcao] }),
    }))
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      if (usuario) {
        await api(`/usuarios/${usuario.id}`, {
          method: 'PUT',
          body: {
            nome: f.nome.trim(),
            papel: f.papel,
            ativo: f.ativo,
            profissionalId: f.profissionalId || null,
            ...(f.senha && { senha: f.senha }),
          },
        })
      } else {
        await api('/usuarios', {
          method: 'POST',
          body: { nome: f.nome.trim(), email: f.email.trim(), senha: f.senha, papel: f.papel, profissionalId: f.profissionalId || null },
        })
      }
      onSalvo()
    } catch (err) {
      setErro((err as Error).message)
      setSalvando(false)
    }
  }

  return (
    <Modal title={usuario ? 'Editar usuário' : 'Novo usuário'} onClose={onClose}>
      <form className="form-grid" onSubmit={salvar}>
        <label className="span-2">Colaborador vinculado
          <select className="input" value={f.profissionalId} onChange={(e) => escolherColaborador(e.target.value)}>
            <option value="">— Nenhum —</option>
            {disponiveis.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} ({FUNCAO_LABEL[c.funcao]})</option>
            ))}
          </select>
        </label>
        <label>Nome<input className="input" required minLength={2} value={f.nome} onChange={(e) => set('nome', e.target.value)} /></label>
        <label>E-mail (login)
          <input className="input" type="email" required disabled={!!usuario} value={f.email} onChange={(e) => set('email', e.target.value)} />
        </label>
        <label className="span-2">Perfil de acesso
          <select className="input" value={f.papel} disabled={souEu} onChange={(e) => set('papel', e.target.value as Papel)}>
            {PAPEIS.map((p) => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
          </select>
          <small className="muted">{souEu ? 'Você não pode alterar o próprio perfil.' : PAPEL_DESCRICAO[f.papel]}</small>
        </label>
        <label className="span-2">{usuario ? 'Nova senha (deixe em branco para manter)' : 'Senha'}
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required={!usuario}
            value={f.senha}
            onChange={(e) => set('senha', e.target.value)}
          />
          <small className="muted">Mínimo de 8 caracteres.</small>
        </label>
        {usuario && !souEu && (
          <label className="check span-2">
            <input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} />
            Ativo (desativado não consegue entrar; a sessão aberta é encerrada na hora)
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
