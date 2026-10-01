import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Card, Modal } from '../../components/ui'
import { api, ApiError } from '../../lib/api'

type Procedimento = {
  id: string
  nome: string
  codigoTuss: string | null
  duracaoMin: number
  valor: number
  ativo: boolean
}

export default function Procedimentos() {
  const [lista, setLista] = useState<Procedimento[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<Procedimento | 'novo' | null>(null)

  const carregar = useCallback(() => {
    api<Procedimento[]>('/procedimentos?todos=true').then(setLista).catch((e) => setErro(e.message))
  }, [])
  useEffect(carregar, [carregar])

  const excluir = async (p: Procedimento) => {
    if (!confirm(`Remover "${p.nome}" do catálogo?`)) return
    try {
      await api(`/procedimentos/${p.id}`, { method: 'DELETE' })
      carregar()
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro ao remover')
    }
  }

  return (
    <Card
      title="Procedimentos e preços"
      action={<button className="btn btn-primary btn-sm" onClick={() => setEditando('novo')}><Plus size={16} /> Adicionar</button>}
    >
      {erro && <p className="text-danger small">{erro}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Procedimento</th>
              <th>Código TUSS</th>
              <th>Duração</th>
              <th>Valor particular</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className={p.ativo ? '' : 'is-inativo'}>
                <td>{p.nome}{!p.ativo && <small className="muted"> · inativo</small>}</td>
                <td className="muted">{p.codigoTuss ?? '—'}</td>
                <td>{p.duracaoMin} min</td>
                <td>{p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="cell-actions">
                  <button className="icon-btn" title="Editar" onClick={() => setEditando(p)}><Pencil size={16} /></button>
                  <button className="icon-btn" title="Remover" onClick={() => excluir(p)}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={5} className="empty">Nenhum procedimento cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      {editando && (
        <ProcedimentoModal
          procedimento={editando === 'novo' ? null : editando}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            carregar()
          }}
        />
      )}
    </Card>
  )
}

function ProcedimentoModal({ procedimento, onClose, onSalvo }: { procedimento: Procedimento | null; onClose: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    nome: procedimento?.nome ?? '',
    codigoTuss: procedimento?.codigoTuss ?? '',
    duracaoMin: procedimento?.duracaoMin ?? 30,
    valor: procedimento?.valor ?? 0,
    ativo: procedimento?.ativo ?? true,
  })
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    const body = { nome: f.nome.trim(), codigoTuss: f.codigoTuss.trim() || null, duracaoMin: f.duracaoMin, valor: f.valor, ativo: f.ativo }
    try {
      await api(procedimento ? `/procedimentos/${procedimento.id}` : '/procedimentos', { method: procedimento ? 'PUT' : 'POST', body })
      onSalvo()
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro ao salvar')
      setSalvando(false)
    }
  }

  return (
    <Modal title={procedimento ? 'Editar procedimento' : 'Novo procedimento'} onClose={onClose}>
      <form className="form-grid" onSubmit={salvar}>
        <label className="span-2">Nome<input className="input" required minLength={2} value={f.nome} onChange={(e) => set('nome', e.target.value)} /></label>
        <label>Código TUSS<input className="input" value={f.codigoTuss} onChange={(e) => set('codigoTuss', e.target.value)} /></label>
        <label>Duração (min)<input className="input" type="number" min={5} max={600} value={f.duracaoMin} onChange={(e) => set('duracaoMin', Number(e.target.value))} /></label>
        <label>Valor particular (R$)<input className="input" type="number" min={0} step="0.01" value={f.valor} onChange={(e) => set('valor', Number(e.target.value))} /></label>
        {procedimento && (
          <label className="check span-2">
            <input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} />
            Ativo (desmarque pra tirar do catálogo sem perder o histórico)
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
