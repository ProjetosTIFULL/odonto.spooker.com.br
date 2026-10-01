// Dados de exemplo — serão substituídos pela API.

export type StatusConsulta = 'agendada' | 'confirmada' | 'em_atendimento' | 'concluida' | 'faltou' | 'cancelada' | 'remarcada'

export type Profissional = { id: string; nome: string; especialidade: string; cor: string }

export type Paciente = {
  id: string
  nome: string
  telefone: string
  email: string
  nascimento: string
  convenio: string
  ultimaVisita: string | null
  status: 'ativo' | 'inativo' | 'em_tratamento'
}

export type Consulta = {
  id: string
  pacienteId: string
  profissionalId: string
  data: string // YYYY-MM-DD
  inicio: string // HH:mm
  fim: string
  procedimento: string
  status: StatusConsulta
}

export type Mensagem = { de: 'paciente' | 'clinica'; texto: string; hora: string }

export type Conversa = {
  id: string
  pacienteId: string | null
  nome: string
  telefone: string
  ultimaMensagem: string
  hora: string
  naoLidas: number
  mensagens: Mensagem[]
}

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const addDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toISODate(d)
}
export const hoje = addDays(0)

export const profissionais: Profissional[] = [
  { id: 'p1', nome: 'Dra. Ana Souza', especialidade: 'Clínico Geral', cor: '#0e7c86' },
  { id: 'p2', nome: 'Dr. Bruno Lima', especialidade: 'Ortodontia', cor: '#7c4dff' },
  { id: 'p3', nome: 'Dra. Carla Mendes', especialidade: 'Endodontia', cor: '#e8710a' },
]

export const pacientes: Paciente[] = [
  { id: 'c1', nome: 'Mariana Alves', telefone: '(51) 99812-3344', email: 'mariana@email.com', nascimento: '1990-10-02', convenio: 'Particular', ultimaVisita: addDays(-12), status: 'em_tratamento' },
  { id: 'c2', nome: 'João Pereira', telefone: '(51) 98455-1020', email: 'joao.p@email.com', nascimento: '1985-03-14', convenio: 'Bradesco Dental', ultimaVisita: addDays(-40), status: 'ativo' },
  { id: 'c3', nome: 'Fernanda Costa', telefone: '(51) 99101-7788', email: 'fe.costa@email.com', nascimento: '1978-09-30', convenio: 'OdontoPrev', ultimaVisita: addDays(-3), status: 'em_tratamento' },
  { id: 'c4', nome: 'Ricardo Gomes', telefone: '(51) 98822-4455', email: 'ricardo.g@email.com', nascimento: '2001-06-21', convenio: 'Particular', ultimaVisita: addDays(-200), status: 'inativo' },
  { id: 'c5', nome: 'Luísa Martins', telefone: '(51) 99333-6677', email: 'luisa.m@email.com', nascimento: '1995-10-05', convenio: 'Bradesco Dental', ultimaVisita: addDays(-7), status: 'ativo' },
  { id: 'c6', nome: 'Paulo Henrique', telefone: '(51) 98100-2233', email: 'paulo.h@email.com', nascimento: '1969-12-11', convenio: 'Amil Dental', ultimaVisita: null, status: 'ativo' },
  { id: 'c7', nome: 'Beatriz Rocha', telefone: '(51) 99654-1122', email: 'bia.rocha@email.com', nascimento: '2010-04-18', convenio: 'Particular', ultimaVisita: addDays(-90), status: 'ativo' },
  { id: 'c8', nome: 'Gustavo Nunes', telefone: '(51) 98777-9900', email: 'gustavo.n@email.com', nascimento: '1988-10-01', convenio: 'OdontoPrev', ultimaVisita: addDays(-25), status: 'em_tratamento' },
]

export const consultas: Consulta[] = [
  { id: 'a1', pacienteId: 'c1', profissionalId: 'p1', data: hoje, inicio: '08:00', fim: '09:00', procedimento: 'Restauração', status: 'concluida' },
  { id: 'a2', pacienteId: 'c3', profissionalId: 'p3', data: hoje, inicio: '09:00', fim: '10:30', procedimento: 'Tratamento de canal', status: 'em_atendimento' },
  { id: 'a3', pacienteId: 'c5', profissionalId: 'p1', data: hoje, inicio: '10:00', fim: '10:30', procedimento: 'Avaliação', status: 'confirmada' },
  { id: 'a4', pacienteId: 'c8', profissionalId: 'p2', data: hoje, inicio: '11:00', fim: '11:30', procedimento: 'Manutenção aparelho', status: 'confirmada' },
  { id: 'a5', pacienteId: 'c2', profissionalId: 'p1', data: hoje, inicio: '14:00', fim: '15:00', procedimento: 'Limpeza', status: 'agendada' },
  { id: 'a6', pacienteId: 'c6', profissionalId: 'p2', data: hoje, inicio: '15:00', fim: '16:00', procedimento: 'Documentação ortodôntica', status: 'agendada' },
  { id: 'a7', pacienteId: 'c7', profissionalId: 'p1', data: hoje, inicio: '16:30', fim: '17:00', procedimento: 'Aplicação de flúor', status: 'faltou' },
  { id: 'a8', pacienteId: 'c4', profissionalId: 'p3', data: addDays(1), inicio: '09:00', fim: '10:00', procedimento: 'Avaliação', status: 'agendada' },
  { id: 'a9', pacienteId: 'c1', profissionalId: 'p1', data: addDays(1), inicio: '10:00', fim: '11:00', procedimento: 'Restauração', status: 'confirmada' },
  { id: 'a10', pacienteId: 'c3', profissionalId: 'p3', data: addDays(2), inicio: '14:00', fim: '15:30', procedimento: 'Tratamento de canal', status: 'agendada' },
  { id: 'a11', pacienteId: 'c8', profissionalId: 'p2', data: addDays(3), inicio: '08:30', fim: '09:00', procedimento: 'Manutenção aparelho', status: 'agendada' },
  { id: 'a12', pacienteId: 'c5', profissionalId: 'p1', data: addDays(-1), inicio: '13:00', fim: '14:00', procedimento: 'Clareamento', status: 'concluida' },
]

export const conversas: Conversa[] = [
  {
    id: 'w1', pacienteId: 'c2', nome: 'João Pereira', telefone: '(51) 98455-1020', ultimaMensagem: 'Confirmo sim, obrigado!', hora: '09:42', naoLidas: 1,
    mensagens: [
      { de: 'clinica', texto: 'Olá João! Lembrando da sua limpeza hoje às 14:00 com a Dra. Ana. Confirma? Responda SIM ou NÃO.', hora: '08:00' },
      { de: 'paciente', texto: 'Confirmo sim, obrigado!', hora: '09:42' },
    ],
  },
  {
    id: 'w2', pacienteId: null, nome: '+55 51 99200-4411', telefone: '(51) 99200-4411', ultimaMensagem: 'Vocês atendem implante? Quanto custa uma avaliação?', hora: '09:15', naoLidas: 2,
    mensagens: [
      { de: 'paciente', texto: 'Bom dia!', hora: '09:14' },
      { de: 'paciente', texto: 'Vocês atendem implante? Quanto custa uma avaliação?', hora: '09:15' },
    ],
  },
  {
    id: 'w3', pacienteId: 'c7', nome: 'Beatriz Rocha', telefone: '(51) 99654-1122', ultimaMensagem: 'Posso remarcar para semana que vem?', hora: 'Ontem', naoLidas: 1,
    mensagens: [
      { de: 'clinica', texto: 'Oi Beatriz, sentimos sua falta hoje! Gostaria de remarcar?', hora: 'Ontem' },
      { de: 'paciente', texto: 'Posso remarcar para semana que vem?', hora: 'Ontem' },
    ],
  },
  {
    id: 'w4', pacienteId: 'c1', nome: 'Mariana Alves', telefone: '(51) 99812-3344', ultimaMensagem: 'Perfeito, até lá!', hora: 'Seg', naoLidas: 0,
    mensagens: [
      { de: 'clinica', texto: 'Mariana, sua próxima sessão ficou para amanhã às 10:00.', hora: 'Seg' },
      { de: 'paciente', texto: 'Perfeito, até lá!', hora: 'Seg' },
    ],
  },
]

export const statusLabel: Record<StatusConsulta, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  em_atendimento: 'Em atendimento',
  concluida: 'Concluída',
  faltou: 'Faltou',
  cancelada: 'Cancelada',
  remarcada: 'Remarcada',
}

export const getPaciente = (id: string | null) => pacientes.find((p) => p.id === id)
export const getProfissional = (id: string) => profissionais.find((p) => p.id === id)!

export type Procedimento = { nome: string; tuss: string; duracao: number; valor: number }

export const procedimentos: Procedimento[] = [
  { nome: 'Avaliação / consulta inicial', tuss: '81000065', duracao: 30, valor: 150 },
  { nome: 'Limpeza (profilaxia)', tuss: '84000139', duracao: 60, valor: 250 },
  { nome: 'Aplicação de flúor', tuss: '84000090', duracao: 30, valor: 90 },
  { nome: 'Restauração em resina', tuss: '85100196', duracao: 60, valor: 280 },
  { nome: 'Tratamento de canal (molar)', tuss: '85200107', duracao: 90, valor: 1200 },
  { nome: 'Extração simples', tuss: '82000786', duracao: 45, valor: 300 },
  { nome: 'Clareamento de consultório', tuss: '85400076', duracao: 60, valor: 900 },
  { nome: 'Manutenção de aparelho', tuss: '87000059', duracao: 30, valor: 180 },
]

/** Horário de atendimento por dia da semana (0 = domingo). null = fechado. */
export const horariosAtendimento: Record<number, { abre: string; fecha: string } | null> = {
  0: null,
  1: { abre: '08:00', fecha: '19:00' },
  2: { abre: '08:00', fecha: '19:00' },
  3: { abre: '08:00', fecha: '19:00' },
  4: { abre: '08:00', fecha: '19:00' },
  5: { abre: '08:00', fecha: '19:00' },
  6: { abre: '08:00', fecha: '12:00' },
}
