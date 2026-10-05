import { useState } from 'react'
import { Bell, Bot, Building2, Clock, CreditCard, MessageCircle, ShieldCheck, Stethoscope, Users } from 'lucide-react'
import { Card, Placeholder } from '../components/ui'
import Colaboradores from './config/Colaboradores'
import DadosClinica from './config/DadosClinica'
import Horarios from './config/Horarios'
import Lembretes from './config/Lembretes'
import McpAgente from './config/McpAgente'
import Procedimentos from './config/Procedimentos'
import Usuarios from './config/Usuarios'
import WhatsApp from './config/WhatsApp'

const SECOES = [
  { id: 'clinica', label: 'Dados da clínica', icon: Building2 },
  { id: 'profissionais', label: 'Profissionais e colaboradores', icon: Stethoscope },
  { id: 'horarios', label: 'Horários de atendimento', icon: Clock },
  { id: 'procedimentos', label: 'Procedimentos e preços', icon: CreditCard },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'mcp', label: 'MCP / Agente IA', icon: Bot },
  { id: 'notificacoes', label: 'Lembretes automáticos', icon: Bell },
  { id: 'usuarios', label: 'Usuários e permissões', icon: Users },
  { id: 'plano', label: 'Plano e assinatura', icon: ShieldCheck },
] as const

type SecaoId = (typeof SECOES)[number]['id']

export default function Configuracoes() {
  const [secao, setSecao] = useState<SecaoId>('clinica')

  return (
    <div className="settings">
      <nav className="settings-nav card">
        {SECOES.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`settings-link ${secao === id ? 'active' : ''}`} onClick={() => setSecao(id)}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </nav>
      <div className="settings-body">{render(secao)}</div>
    </div>
  )
}

function render(secao: SecaoId) {
  switch (secao) {
    case 'clinica':
      return <DadosClinica />
    case 'profissionais':
      return <Colaboradores />

    case 'horarios':
      return <Horarios />
    case 'whatsapp':
      return <WhatsApp />
    case 'mcp':
      return <McpAgente />
    case 'notificacoes':
      return <Lembretes />
    case 'procedimentos':
      return <Procedimentos />
    case 'usuarios':
      return <Usuarios />
    case 'plano':
      return (
        <Card title="Plano e assinatura">
          <Placeholder items={['Plano atual e limites', 'Forma de pagamento', 'Histórico de faturas']} />
        </Card>
      )
  }
}
