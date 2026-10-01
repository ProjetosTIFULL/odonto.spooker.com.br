import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Card } from '../../components/ui'
import { api, ApiError } from '../../lib/api'

type Status = { connectionStatus?: string; phone_number?: string | null; erro?: string }
type QrCode = { base64?: string; pairingCode?: string; erro?: string }

export default function WhatsApp() {
  const [status, setStatus] = useState<Status | null>(null)
  const [qr, setQr] = useState<QrCode | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const intervalo = useRef<ReturnType<typeof setInterval>>(undefined)

  const conectado = status?.connectionStatus === 'open'
  const semAgente = status?.erro?.includes('não tem um agente')

  const buscarStatus = () => {
    api<Status>('/whatsapp/status')
      .then((s) => {
        setStatus(s)
        if (s.connectionStatus === 'open') setQr(null) // conectou: esconde o QR Code
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Erro ao consultar status'))
  }

  useEffect(() => {
    buscarStatus()
    intervalo.current = setInterval(buscarStatus, 5000)
    return () => clearInterval(intervalo.current)
  }, [])

  const conectar = () => {
    setCarregando(true)
    setErro('')
    api<QrCode>('/whatsapp/qrcode')
      .then((r) => {
        if (r.erro) setErro(r.erro)
        else setQr(r)
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Erro ao gerar QR Code'))
      .finally(() => setCarregando(false))
  }

  const desconectar = () => {
    if (!confirm('Desconectar o WhatsApp desta clínica? Ela para de receber mensagens até conectar de novo.')) return
    setCarregando(true)
    api('/whatsapp/desconectar', { method: 'POST' })
      .then(() => {
        setQr(null)
        buscarStatus()
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Erro ao desconectar'))
      .finally(() => setCarregando(false))
  }

  return (
    <Card title="Integração WhatsApp">
      <p className="muted">Conecte o número da clínica para o agente de IA atender pelo WhatsApp de verdade.</p>

      {erro && <p className="text-danger small">{erro}</p>}

      {semAgente ? (
        <p className="muted small">Esta clínica ainda não tem um agente de IA vinculado. Fale com o suporte Spooker.</p>
      ) : (
        <>
          <div className="wpp-status">
            <span className={`status-dot ${conectado ? '' : 'off'}`} />
            {conectado ? `Conectado — ${status?.phone_number}` : 'Não conectado'}
            {conectado ? (
              <button className="btn btn-ghost btn-sm" onClick={desconectar} disabled={carregando}>
                Desconectar
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={conectar} disabled={carregando}>
                <RefreshCw size={14} className={carregando ? 'spin' : undefined} /> Conectar número
              </button>
            )}
          </div>

          {qr?.base64 && (
            <div className="qr-wrap">
              <img src={qr.base64} alt="QR Code para conectar o WhatsApp" width={220} height={220} />
              <p className="muted small">Abra o WhatsApp no celular da clínica → Aparelhos conectados → Conectar um aparelho.</p>
            </div>
          )}
          {qr?.pairingCode && <p>Ou use o código: <strong>{qr.pairingCode}</strong></p>}
        </>
      )}
    </Card>
  )
}
