import { useState } from 'react'
import { Bell, Bot, Building2, Clock, CreditCard, MessageCircle, ShieldCheck, Stethoscope, Users } from 'lucide-react'
import { Avatar, Card, Placeholder } from '../components/ui'
import SyncMcpButton from '../components/SyncMcpButton'
import { procedimentos, profissionais } from '../data/mock'
import McpAgente from './config/McpAgente'

const SECOES = [
  { id: 'clinica', label: 'Dados da clínica', icon: Building2 },
  { id: 'profissionais', label: 'Profissionais', icon: Stethoscope },
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
      return (
        <Card title="Dados da clínica">
          <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
            <label>Tipo de conta
              <select className="input" defaultValue="clinica">
                <option value="clinica">Clínica</option>
                <option value="autonomo">Dentista autônomo</option>
              </select>
            </label>
            <label>Nome / Razão social<input className="input" defaultValue="Clínica Sorriso" /></label>
            <label>CNPJ / CPF<input className="input" placeholder="00.000.000/0000-00" /></label>
            <label>CRO responsável<input className="input" placeholder="CRO-RS 00000" /></label>
            <label>Telefone<input className="input" defaultValue="(51) 3333-0000" /></label>
            <label>E-mail<input className="input" defaultValue="contato@clinicasorriso.com.br" /></label>
            <label className="span-2">Endereço<input className="input" placeholder="Rua, número, bairro, cidade" /></label>
            <div className="span-2"><button className="btn btn-primary">Salvar</button></div>
          </form>
        </Card>
      )
    case 'profissionais':
      return (
        <Card title="Profissionais" action={<button className="btn btn-primary btn-sm">Adicionar</button>}>
          <ul className="list">
            {profissionais.map((p) => (
              <li key={p.id} className="list-row">
                <Avatar nome={p.nome} cor={p.cor} />
                <div className="grow">
                  <strong>{p.nome}</strong>
                  <small>{p.especialidade}</small>
                </div>
                <button className="btn btn-ghost btn-sm">Editar</button>
              </li>
            ))}
          </ul>
        </Card>
      )
    case 'horarios':
      return (
        <Card title="Horários de atendimento" action={<SyncMcpButton recurso="horários de atendimento" />}>
          <table className="table">
            <tbody>
              {['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map((d, i) => (
                <tr key={d}>
                  <td><label className="check"><input type="checkbox" defaultChecked={i < 6} /> {d}</label></td>
                  <td><input type="time" className="input" defaultValue="08:00" /></td>
                  <td><input type="time" className="input" defaultValue={i === 5 ? '12:00' : '19:00'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )
    case 'whatsapp':
      return (
        <Card title="Integração WhatsApp">
          <p className="muted">Conecte o número da clínica para enviar e receber mensagens pelo portal.</p>
          <div className="wpp-status">
            <span className="status-dot off" /> Não conectado
            <button className="btn btn-primary btn-sm">Conectar número</button>
          </div>
          <Placeholder items={[
            'Conexão via WhatsApp Business API (oficial) ou QR Code',
            'Respostas rápidas / modelos de mensagem',
            'Mensagem de ausência fora do horário',
            'Distribuição de conversas entre atendentes',
          ]} />
        </Card>
      )
    case 'mcp':
      return <McpAgente />
    case 'notificacoes':
      return (
        <Card title="Lembretes automáticos">
          <Placeholder items={[
            'Confirmação de consulta 24h antes (com resposta SIM/NÃO atualizando a agenda)',
            'Lembrete no dia da consulta',
            'Mensagem pós-atendimento / pesquisa de satisfação',
            'Parabéns de aniversário',
            'Campanha de retorno (pacientes sem visita há X meses)',
          ]} />
        </Card>
      )
    case 'procedimentos':
      return (
        <Card
          title="Procedimentos e preços"
          action={
            <div className="toolbar-group">
              <SyncMcpButton recurso="procedimentos e preços" />
              <button className="btn btn-primary btn-sm">Adicionar</button>
            </div>
          }
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Procedimento</th>
                  <th>Código TUSS</th>
                  <th>Duração</th>
                  <th>Valor particular</th>
                </tr>
              </thead>
              <tbody>
                {procedimentos.map((p) => (
                  <tr key={p.nome}>
                    <td>{p.nome}</td>
                    <td className="muted">{p.tuss}</td>
                    <td>{p.duracao} min</td>
                    <td>{p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Placeholder items={['Tabelas de preço por convênio']} />
        </Card>
      )
    case 'usuarios':
      return (
        <Card title="Usuários e permissões">
          <Placeholder items={[
            'Perfis: Administrador, Dentista, Recepção',
            'Convite por e-mail',
            'Controle de acesso por módulo',
            'Registro de atividades (auditoria / LGPD)',
          ]} />
        </Card>
      )
    case 'plano':
      return (
        <Card title="Plano e assinatura">
          <Placeholder items={['Plano atual e limites', 'Forma de pagamento', 'Histórico de faturas']} />
        </Card>
      )
  }
}
