// Tipo e rótulos de status de consulta, usados em várias telas (Agenda, componentes de UI).
// Os dados de exemplo que existiam aqui (pacientes/consultas/conversas fictícios) foram
// removidos: nenhuma tela usa mais mock, tudo vem da API - só o tipo e os rótulos sobraram.

export type StatusConsulta = 'agendada' | 'confirmada' | 'em_atendimento' | 'concluida' | 'faltou' | 'cancelada' | 'remarcada'

export const statusLabel: Record<StatusConsulta, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  em_atendimento: 'Em atendimento',
  concluida: 'Concluída',
  faltou: 'Faltou',
  cancelada: 'Cancelada',
  remarcada: 'Remarcada',
}
