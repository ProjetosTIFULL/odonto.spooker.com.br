import { useState } from 'react'
import { Award, ClipboardList, LineChart } from 'lucide-react'
import { useUsuario } from '../auth/AuthContext'
import Desempenho from './dashboard/Desempenho'
import Financeiro from './dashboard/Financeiro'
import Rotina from './dashboard/Rotina'

type Aba = 'financeiro' | 'rotina' | 'desempenho'

const OPCOES: { id: Aba; titulo: string; descricao: string; icon: typeof LineChart }[] = [
  { id: 'financeiro', titulo: 'Financeiro', descricao: 'Faturamento, previsão do mês, ticket médio, faltas e rankings.', icon: LineChart },
  { id: 'rotina', titulo: 'Rotina', descricao: 'Agenda de hoje, pendências, confirmações e aniversariantes.', icon: ClipboardList },
  { id: 'desempenho', titulo: 'Desempenho', descricao: 'Atendimentos por dentista, comparecimento, notas pós-consulta e comentários.', icon: Award },
]

/**
 * Admin escolhe primeiro entre Financeiro, Rotina e Desempenho (os gráficos só aparecem depois da escolha).
 * Secretário/operador só tem a Rotina: abre direto nela (a API também bloqueia o financeiro).
 */
export default function Dashboard() {
  const usuario = useUsuario()
  const ehAdmin = usuario.papel === 'ADMIN'
  const [aba, setAba] = useState<Aba | null>(ehAdmin ? null : 'rotina')

  if (!ehAdmin) {
    return (
      <div className="page">
        <Rotina />
      </div>
    )
  }

  if (!aba) {
    return (
      <div className="page">
        <div className="dash-escolha">
          {OPCOES.map(({ id, titulo, descricao, icon: Icon }) => (
            <button key={id} className="dash-opcao card" onClick={() => setAba(id)}>
              <span className="dash-opcao-icone"><Icon size={28} /></span>
              <strong>{titulo}</strong>
              <small>{descricao}</small>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="segmented dash-abas" role="tablist" aria-label="Visão do dashboard">
        {OPCOES.map(({ id, titulo }) => (
          <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? 'active' : ''} onClick={() => setAba(id)}>
            {titulo}
          </button>
        ))}
      </div>
      {aba === 'financeiro' && <Financeiro />}
      {aba === 'rotina' && <Rotina />}
      {aba === 'desempenho' && <Desempenho />}
    </div>
  )
}
