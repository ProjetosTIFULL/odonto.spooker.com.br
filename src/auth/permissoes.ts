// Quem acessa o quê. Mesma regra aplicada na API (server/src/auth.ts).

export type Papel = 'ADMIN' | 'OPERADOR' | 'DENTISTA'
export type FuncaoColaborador = 'DENTISTA' | 'SECRETARIO'
export type Modulo = 'dashboard' | 'agenda' | 'chat' | 'clientes' | 'configuracoes'

export const PAPEL_LABEL: Record<Papel, string> = {
  ADMIN: 'Administrador',
  OPERADOR: 'Secretário(a) / Operador',
  DENTISTA: 'Dentista / Médico',
}

export const PAPEL_DESCRICAO: Record<Papel, string> = {
  ADMIN: 'Acesso total, inclusive Configurações.',
  OPERADOR: 'Dashboard, Agenda, Chat e Clientes. Sem acesso a Configurações.',
  DENTISTA: 'Somente a Agenda.',
}

export const FUNCAO_LABEL: Record<FuncaoColaborador, string> = {
  DENTISTA: 'Dentista / Médico',
  SECRETARIO: 'Secretário(a) / Operador',
}

/** Perfil sugerido ao criar o login de um colaborador. */
export const PAPEL_POR_FUNCAO: Record<FuncaoColaborador, Papel> = {
  DENTISTA: 'DENTISTA',
  SECRETARIO: 'OPERADOR',
}

const ACESSO: Record<Papel, Modulo[]> = {
  ADMIN: ['dashboard', 'agenda', 'chat', 'clientes', 'configuracoes'],
  OPERADOR: ['dashboard', 'agenda', 'chat', 'clientes'],
  DENTISTA: ['agenda'],
}

export const podeAcessar = (papel: Papel, modulo: Modulo) => ACESSO[papel].includes(modulo)

/** Primeira tela disponível para o perfil (destino após o login). */
export const telaInicial = (papel: Papel) => `/${ACESSO[papel][0]}`
