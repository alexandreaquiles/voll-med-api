// Agendar consulta e avaliar especialista exigem login: ninguém age em nome de outro paciente.
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { cpf } from 'cpf-cnpj-validator'
import request from 'supertest'
import type { Express } from 'express'
import type { DataSource } from 'typeorm'
import { Avaliacoes } from '../avaliacoes/avaliacoesEntity.js'
import { Clinica } from '../clinicas/clinicaEntity.js'
import { Consulta } from '../consultas/consultaEntity.js'
import { Especialista } from '../especialistas/EspecialistaEntity.js'
import { Paciente } from '../pacientes/pacienteEntity.js'
import { iniciaApp } from './helpers/app.js'
import { criaClinica, criaEspecialista, criaPaciente, tokenDe } from './helpers/dados.js'

let app: Express
let dataSource: DataSource

let clinicaA: Clinica
let especialistaA: Especialista
let especialistaB: Especialista
let ana: Paciente
let bruno: Paciente

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())

  clinicaA = await criaClinica(dataSource, 'Clinica A')
  const clinicaB = await criaClinica(dataSource, 'Clinica B')
  especialistaA = await criaEspecialista(dataSource, 'Dra A', 'CRM-A', clinicaA)
  especialistaB = await criaEspecialista(dataSource, 'Dr B', 'CRM-B', clinicaB)
  ana = await criaPaciente(dataSource, 'Ana Souza', cpf.generate(), [])
  bruno = await criaPaciente(dataSource, 'Bruno Lima', cpf.generate(), [])
})

afterAll(async () => {
  await dataSource?.destroy()
})

const autorizacao = (entidade: { id: string, role: any }): [string, string] =>
  ['Authorization', `Bearer ${tokenDe(entidade)}`]

// Dias úteis futuros, dentro do horário da clínica (07h às 19h UTC)
const consultaEm = (dia: number, especialista: Especialista, paciente?: Paciente): Record<string, unknown> => ({
  especialista: especialista.id,
  paciente: paciente?.id,
  data: `2030-01-${dia}T14:00:00.000Z`,
  desejaLembrete: false
})

const consultasNoBanco = async (): Promise<Consulta[]> =>
  await dataSource.manager.find(Consulta, { relations: { paciente: true, especialista: true } })

describe('agendamento de consulta (POST /consulta)', () => {
  test('exige login', async () => {
    const resposta = await request(app).post('/consulta').send(consultaEm(15, especialistaA, bruno))

    expect(resposta.status).toBe(403)
    expect(await consultasNoBanco()).toHaveLength(0)
  })

  test('não deixa um paciente marcar consulta para outro', async () => {
    const resposta = await request(app).post('/consulta').set(...autorizacao(ana)).send(consultaEm(15, especialistaA, bruno))

    expect(resposta.status).toBe(403)
    expect(await consultasNoBanco()).toHaveLength(0)
  })

  test('marca a consulta para o próprio paciente, mesmo sem informá-lo no corpo', async () => {
    const resposta = await request(app).post('/consulta').set(...autorizacao(ana)).send(consultaEm(16, especialistaA))

    expect(resposta.status).toBe(200)
    const consulta = await dataSource.manager.findOne(Consulta, { where: { id: resposta.body.id }, relations: { paciente: true } })
    expect(consulta?.paciente.id).toBe(ana.id)
  })

  test('deixa a clínica marcar consulta para um paciente com um especialista dela', async () => {
    const resposta = await request(app).post('/consulta').set(...autorizacao(clinicaA)).send(consultaEm(17, especialistaA, bruno))

    expect(resposta.status).toBe(200)
  })

  test('não deixa a clínica marcar consulta com especialista de outra clínica', async () => {
    const resposta = await request(app).post('/consulta').set(...autorizacao(clinicaA)).send(consultaEm(18, especialistaB, bruno))

    expect(resposta.status).toBe(403)
  })

  test('não deixa um especialista marcar consulta', async () => {
    const resposta = await request(app).post('/consulta').set(...autorizacao(especialistaA)).send(consultaEm(22, especialistaA, bruno))

    expect(resposta.status).toBe(403)
  })
})

describe('avaliação de especialista (POST /avaliacoes)', () => {
  const avaliacao = (paciente: Paciente): Record<string, unknown> =>
    ({ idEspecialista: especialistaA.id, idPaciente: paciente.id, nota: 5, descricao: 'Ótima consulta' })

  const avaliacoesNoBanco = async (): Promise<Avaliacoes[]> =>
    await dataSource.manager.find(Avaliacoes, { relations: { paciente: true } })

  test('exige login', async () => {
    const resposta = await request(app).post('/avaliacoes').send(avaliacao(bruno))

    expect(resposta.status).toBe(403)
    expect(await avaliacoesNoBanco()).toHaveLength(0)
  })

  test('não deixa um paciente avaliar em nome de outro', async () => {
    const resposta = await request(app).post('/avaliacoes').set(...autorizacao(ana)).send(avaliacao(bruno))

    expect(resposta.status).toBe(403)
    expect(await avaliacoesNoBanco()).toHaveLength(0)
  })

  test('não deixa uma clínica avaliar', async () => {
    const resposta = await request(app).post('/avaliacoes').set(...autorizacao(clinicaA)).send(avaliacao(bruno))

    expect(resposta.status).toBe(403)
  })

  test('registra a avaliação em nome do paciente logado', async () => {
    const resposta = await request(app).post('/avaliacoes').set(...autorizacao(ana)).send(avaliacao(ana))

    expect(resposta.status).toBe(200)
    const avaliacoes = await avaliacoesNoBanco()
    expect(avaliacoes.map((a) => a.paciente.id)).toEqual([ana.id])
  })
})
