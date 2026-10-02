import type { DataSource } from 'typeorm'
import { access } from '../../auth/tokens.js'
import { Role } from '../../auth/roles.js'
import { Clinica } from '../../clinicas/clinicaEntity.js'
import { Consulta } from '../../consultas/consultaEntity.js'
import { Endereco } from '../../enderecos/enderecoEntity.js'
import { Especialista } from '../../especialistas/EspecialistaEntity.js'
import { Paciente } from '../../pacientes/pacienteEntity.js'
import { encryptPassword } from '../../utils/senhaUtils.js'

// Os dados são gravados direto no banco: o cadastro de paciente pela API
// valida o CEP em um serviço externo.

export function tokenDe (entidade: { id: string, role: Role }): string {
  return access.cria(entidade.id, entidade.role)
}

async function criaEndereco (dataSource: DataSource): Promise<Endereco> {
  const endereco = new Endereco()
  endereco.cep = 1001000
  endereco.rua = 'Praça da Sé'
  endereco.estado = 'SP'
  endereco.numero = 1
  endereco.complemento = 'lado ímpar'
  return await dataSource.manager.save(Endereco, endereco)
}

export async function criaClinica (dataSource: DataSource, nome: string): Promise<Clinica> {
  const clinica = new Clinica()
  clinica.nome = nome
  clinica.email = `${nome.toLowerCase().replace(/\s/g, '')}@teste.com`
  clinica.senha = encryptPassword('Senha@123')
  clinica.endereco = await criaEndereco(dataSource)
  return await dataSource.manager.save(Clinica, clinica)
}

export async function criaEspecialista (dataSource: DataSource, nome: string, crm: string, clinica?: Clinica): Promise<Especialista> {
  const especialista = new Especialista(
    nome, crm, '', true, 'Clínico Geral', `${crm}@teste.com`, '11999999999', false, null, encryptPassword('Senha@123')
  )
  especialista.endereco = await criaEndereco(dataSource)
  if (clinica !== undefined) {
    especialista.clinica = clinica
  }
  return await dataSource.manager.save(Especialista, especialista)
}

export async function criaPaciente (dataSource: DataSource, nome: string, cpf: string, historico: string[]): Promise<Paciente> {
  const paciente = new Paciente(
    cpf, nome, `${cpf}@teste.com`, encryptPassword('Senha@123'), '11987654321', null, true, null, null, historico
  )
  paciente.possuiPlanoSaude = false
  paciente.endereco = await criaEndereco(dataSource)
  return await dataSource.manager.save(Paciente, paciente)
}

export async function criaConsulta (dataSource: DataSource, paciente: Paciente, especialista: Especialista): Promise<Consulta> {
  const consulta = new Consulta()
  consulta.paciente = paciente
  consulta.especialista = especialista
  consulta.data = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  consulta.desejaLembrete = false
  return await dataSource.manager.save(Consulta, consulta)
}

export { Role }
