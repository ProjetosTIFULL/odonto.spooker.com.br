import { useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'

type Props = {
  /** O que está sendo sincronizado, usado no tooltip. Ex: "horários de atendimento" */
  recurso: string
  /** Chamada real ao backend; por enquanto simulada. */
  onSync?: () => Promise<void>
}

const simular = () => new Promise<void>((r) => setTimeout(r, 1200))

export default function SyncMcpButton({ recurso, onSync = simular }: Props) {
  const [sincronizando, setSincronizando] = useState(false)
  const [ultima, setUltima] = useState<Date | null>(null)

  const sincronizar = async () => {
    setSincronizando(true)
    try {
      await onSync()
      setUltima(new Date())
    } finally {
      setSincronizando(false)
    }
  }

  return (
    <div className="sync-mcp">
      {ultima && (
        <small className="muted">
          <Check size={12} className="inline-icon" /> Sincronizado às {ultima.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </small>
      )}
      <button
        className="btn btn-ghost btn-sm"
        onClick={sincronizar}
        disabled={sincronizando}
        title={`Envia os ${recurso} para o servidor MCP, para o agente de IA usar nas respostas`}
      >
        <RefreshCw size={16} className={sincronizando ? 'spin' : undefined} />
        {sincronizando ? 'Sincronizando...' : 'Sincronizar com MCP'}
      </button>
    </div>
  )
}
