import { type FindOptionsWhere } from 'typeorm'
import { Role } from '../auth/roles.js'
import { type Paciente } from '../pacientes/pacienteEntity.js'
import { type Consulta } from './consultaEntity.js'

// Consultas que cada usuário pode ver: o paciente vê as próprias, o especialista
// as que atende e a clínica as dos seus especialistas. Usuários sem papel reconhecido
// não veem nenhuma (null).
export function filtroDeConsultasVisiveis (userId?: string, role?: string): FindOptionsWhere<Consulta> | null {
  switch (role) {
    case Role.paciente:
      return { paciente: { id: userId } }
    case Role.especialista:
      return { especialista: { id: userId } }
    case Role.clinica:
      return { especialista: { clinica: { id: userId } } }
    default:
      return null
  }
}

// Exige a consulta carregada com paciente, especialista e a clínica do especialista
export function participaDaConsulta (consulta: Consulta, userId?: string, role?: string): boolean {
  switch (role) {
    case Role.paciente:
      return consulta.paciente?.id === userId
    case Role.especialista:
      return consulta.especialista?.id === userId
    case Role.clinica:
      return consulta.especialista?.clinica?.id === userId
    default:
      return false
  }
}

// Dados do paciente que podem aparecer em listagens e consultas: sem CPF, histórico e senha
export function resumoDoPaciente (paciente: Paciente): Pick<Paciente, 'id' | 'nome' | 'email' | 'telefone'> {
  return {
    id: paciente.id,
    nome: paciente.nome,
    email: paciente.email,
    telefone: paciente.telefone
  }
}

export function consultaSemDadosSensiveis (consulta: Consulta): Record<string, unknown> {
  const { paciente, especialista, ...dados } = consulta
  return {
    ...dados,
    paciente: paciente != null ? resumoDoPaciente(paciente) : paciente,
    especialista: especialista != null
      ? { id: especialista.id, nome: especialista.nome, especialidade: especialista.especialidade }
      : especialista
  }
}
