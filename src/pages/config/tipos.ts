import type { FuncaoColaborador, Papel } from '../../auth/permissoes'

export type Colaborador = {
  id: string
  nome: string
  funcao: FuncaoColaborador
  especialidade: string | null
  cro: string | null
  telefone: string | null
  email: string | null
  cor: string
  ativo: boolean
  usuario?: { id: string; email: string; papel: Papel; ativo: boolean } | null
}

export type UsuarioClinica = {
  id: string
  nome: string
  email: string
  papel: Papel
  ativo: boolean
  criadoEm: string
  profissional: { id: string; nome: string; funcao: FuncaoColaborador } | null
}
