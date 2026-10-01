import { useEffect, useState } from 'react'
import { Card } from '../../components/ui'
import { api, ApiError } from '../../lib/api'

type Horario = { diaSemana: number; abre: string; fecha: string; ativo: boolean }

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function Horarios() {
  const [horarios, setHorarios] = useState<Horario[] | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  useEffect(() => {
    api<Horario[]>('/clinica/horarios').then((hs) => {
      // Garante uma linha pra cada dia da semana, mesmo que a clinica ainda nao tenha nenhuma salva.
      const porDia = new Map(hs.map((h) => [h.diaSemana, h]))
      setHorarios(DIAS.map((_, i) => porDia.get(i) ?? { diaSemana: i, abre: '08:00', fecha: '19:00', ativo: i !== 0 }))
    }).catch((e) => setErro(e.message))
  }, [])

  const set = (dia: number, patch: Partial<Horario>) =>
    setHorarios((hs) => hs?.map((h) => (h.diaSemana === dia ? { ...h, ...patch } : h)) ?? hs)

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!horarios) return
    setSalvando(true)
    setErro(null)
    try {
      const salvos = await api<Horario[]>('/clinica/horarios', { method: 'PUT', body: horarios })
      const porDia = new Map(salvos.map((h) => [h.diaSemana, h]))
      setHorarios(DIAS.map((_, i) => porDia.get(i)!))
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2000)
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  if (!horarios) return <Card title="Horários de atendimento">{erro ? <p className="text-danger small">{erro}</p> : <p className="muted">Carregando...</p>}</Card>

  return (
    <Card title="Horários de atendimento">
      <form onSubmit={salvar}>
        <table className="table">
          <tbody>
            {DIAS.map((nome, dia) => {
              const h = horarios[dia]
              return (
                <tr key={dia}>
                  <td>
                    <label className="check">
                      <input type="checkbox" checked={h.ativo} onChange={(e) => set(dia, { ativo: e.target.checked })} /> {nome}
                    </label>
                  </td>
                  <td><input type="time" className="input" disabled={!h.ativo} value={h.abre} onChange={(e) => set(dia, { abre: e.target.value })} /></td>
                  <td><input type="time" className="input" disabled={!h.ativo} value={h.fecha} onChange={(e) => set(dia, { fecha: e.target.value })} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {erro && <p className="text-danger small">{erro}</p>}
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando...' : salvo ? 'Salvo!' : 'Salvar'}</button>
        </div>
      </form>
    </Card>
  )
}
