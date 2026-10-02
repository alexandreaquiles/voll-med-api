import { cpf } from 'cpf-cnpj-validator'
import type { DataSource } from 'typeorm'
import { Clinica } from '../clinicas/clinicaEntity.js'
import { Consulta } from '../consultas/consultaEntity.js'
import { Endereco } from '../enderecos/enderecoEntity.js'
import { Especialista } from '../especialistas/EspecialistaEntity.js'
import { Paciente } from '../pacientes/pacienteEntity.js'
import { geraHashDeSenha } from '../utils/senhaUtils.js'

export const SENHA_DE_EXEMPLO = 'Senha@123'
export const EMAIL_DO_GESTOR = 'gestor@voll.com'

// Consultas de uma especialidade em um mês: quantas foram agendadas e os motivos das canceladas
interface Movimento { agendadas: number, cancelamentos: string[] }

const vezes = (quantidade: number, motivo: string): string[] => Array(quantidade).fill(motivo)

// No mês anterior: 18 consultas e 3 cancelamentos. No mês atual: 18 consultas (2 delas hoje) e
// 6 cancelamentos, 4 por parte dos médicos e concentrados em Cardiologia. Com isso, o resumo de
// gestão aponta o aumento em Cardiologia e o motivo predominante.
const MES_ANTERIOR: Record<string, Movimento> = {
  Cardiologia: { agendadas: 8, cancelamentos: ['médico_cancelou', 'paciente_desistiu'] },
  Pediatria: { agendadas: 6, cancelamentos: ['paciente_desistiu'] },
  Dermatologia: { agendadas: 4, cancelamentos: [] }
}
const MES_ATUAL: Record<string, Movimento> = {
  Cardiologia: { agendadas: 7, cancelamentos: [...vezes(4, 'médico_cancelou'), 'paciente_desistiu'] },
  Pediatria: { agendadas: 5, cancelamentos: ['paciente_desistiu'] },
  Dermatologia: { agendadas: 4, cancelamentos: [] }
}
// Consultas ativas de hoje, em UTC (horário de funcionamento da clínica: 07h às 19h UTC)
const CONSULTAS_DE_HOJE: Array<{ especialidade: string, hora: number }> = [
  { especialidade: 'Cardiologia', hora: 13 },
  { especialidade: 'Pediatria', hora: 16 }
]

const PACIENTES: Array<{ nome: string, historico: string[] }> = [
  { nome: 'Joana Ribeiro', historico: ['hipertensão'] },
  { nome: 'Marcos Lima', historico: [] },
  { nome: 'Helena Costa', historico: ['asma'] },
  { nome: 'Rafael Souza', historico: ['diabetes tipo 2'] },
  { nome: 'Beatriz Alves', historico: [] },
  { nome: 'Pedro Martins', historico: ['alergia a dipirona'] }
]

export interface ResultadoDoSeed {
  clinicas: Array<{ nome: string, email: string }>
  especialistas: Array<{ nome: string, email: string }>
  pacientes: Array<{ nome: string, email: string }>
  consultas: number
}

const emailDe = (nome: string): string =>
  `${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.')}@voll.com`

async function criaEndereco (dataSource: DataSource): Promise<Endereco> {
  const endereco = new Endereco()
  endereco.cep = 1001000
  endereco.rua = 'Praça da Sé'
  endereco.estado = 'SP'
  endereco.numero = 100
  endereco.complemento = 'sala 1'
  return await dataSource.manager.save(Endereco, endereco)
}

async function criaClinica (dataSource: DataSource, nome: string, email: string): Promise<Clinica> {
  const clinica = new Clinica()
  clinica.nome = nome
  clinica.email = email
  clinica.senha = geraHashDeSenha(SENHA_DE_EXEMPLO)
  clinica.endereco = await criaEndereco(dataSource)
  return await dataSource.manager.save(Clinica, clinica)
}

async function criaEspecialista (
  dataSource: DataSource, clinica: Clinica, nome: string, crm: string, especialidade: string
): Promise<Especialista> {
  const especialista = new Especialista(
    nome, crm, '', true, especialidade, emailDe(nome), '11999990000', false, null, geraHashDeSenha(SENHA_DE_EXEMPLO)
  )
  especialista.clinica = clinica
  especialista.endereco = await criaEndereco(dataSource)
  return await dataSource.manager.save(Especialista, especialista)
}

async function criaPaciente (dataSource: DataSource, nome: string, historico: string[]): Promise<Paciente> {
  const paciente = new Paciente(
    cpf.generate(), nome, emailDe(nome), geraHashDeSenha(SENHA_DE_EXEMPLO), '11987650000', null, true, null, null, historico
  )
  paciente.possuiPlanoSaude = false
  paciente.endereco = await criaEndereco(dataSource)
  return await dataSource.manager.save(Paciente, paciente)
}

// Popula o banco com um cenário de exemplo, com datas relativas a `hoje`.
// Devolve null, sem alterar nada, se o banco já tiver o cenário.
export async function populaBanco (dataSource: DataSource, hoje: Date = new Date()): Promise<ResultadoDoSeed | null> {
  if (await dataSource.manager.findOneBy(Clinica, { email: EMAIL_DO_GESTOR }) !== null) {
    return null
  }

  // "Hoje" é o dia no calendário local de quem roda o seed, como no dashboard
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  const dia = hoje.getDate()

  const clinica = await criaClinica(dataSource, 'Clínica Voll', EMAIL_DO_GESTOR)
  const outraClinica = await criaClinica(dataSource, 'Clínica Vizinha', 'vizinha@voll.com')

  const especialistas: Record<string, Especialista> = {
    Cardiologia: await criaEspecialista(dataSource, clinica, 'Ana Cardoso', 'CRM-SP-1001', 'Cardiologia'),
    Pediatria: await criaEspecialista(dataSource, clinica, 'Bruno Prado', 'CRM-SP-1002', 'Pediatria'),
    Dermatologia: await criaEspecialista(dataSource, clinica, 'Carla Dias', 'CRM-SP-1003', 'Dermatologia')
  }
  const especialistaDaVizinha = await criaEspecialista(dataSource, outraClinica, 'Zeca Moura', 'CRM-SP-2001', 'Ortopedia')

  const pacientes: Paciente[] = []
  for (const { nome, historico } of PACIENTES) {
    pacientes.push(await criaPaciente(dataSource, nome, historico))
  }

  let consultas = 0
  const marca = async (especialista: Especialista, data: Date, motivoCancelamento?: string): Promise<void> => {
    const consulta = new Consulta()
    consulta.especialista = especialista
    consulta.paciente = pacientes[consultas % pacientes.length]
    consulta.data = data
    consulta.desejaLembrete = false
    if (motivoCancelamento !== undefined) {
      consulta.cancelar(motivoCancelamento)
    }
    await dataSource.manager.save(Consulta, consulta)
    consultas++
  }

  // Espalha as consultas pelo mês, fora do dia de hoje, das 09h às 16h UTC
  const marcaNoMes = async (mesDasConsultas: number, movimentos: Record<string, Movimento>): Promise<void> => {
    for (const [especialidade, { agendadas, cancelamentos }] of Object.entries(movimentos)) {
      for (let i = 0; i < agendadas; i++) {
        let diaDaConsulta = 1 + (i * 3) % 27
        if (mesDasConsultas === mes && diaDaConsulta === dia) {
          diaDaConsulta = diaDaConsulta % 27 + 1
        }
        const data = new Date(Date.UTC(ano, mesDasConsultas, diaDaConsulta, 9 + i % 8))
        await marca(especialistas[especialidade], data, cancelamentos[i])
      }
    }
  }

  await marcaNoMes(mes - 1, MES_ANTERIOR)
  await marcaNoMes(mes, MES_ATUAL)
  for (const { especialidade, hora } of CONSULTAS_DE_HOJE) {
    await marca(especialistas[especialidade], new Date(Date.UTC(ano, mes, dia, hora)))
  }
  // Consultas da outra clínica, que não podem aparecer no dashboard da Clínica Voll
  await marca(especialistaDaVizinha, new Date(Date.UTC(ano, mes, dia, 10)))
  await marca(especialistaDaVizinha, new Date(Date.UTC(ano, mes, dia === 28 ? 27 : 28, 11)), 'médico_cancelou')

  return {
    clinicas: [clinica, outraClinica].map(({ nome, email }) => ({ nome, email })),
    especialistas: [...Object.values(especialistas), especialistaDaVizinha].map(({ nome, email }) => ({ nome, email })),
    pacientes: pacientes.map(({ nome, email }) => ({ nome, email })),
    consultas
  }
}
