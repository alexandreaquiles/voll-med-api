// Exposição de dados sensíveis: listagens não podem ser públicas, nem devolver
// CPF, histórico médico ou senha de pacientes, e nenhuma resposta pode devolver senha.
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { cpf } from 'cpf-cnpj-validator'
import request from 'supertest'
import type { Express } from 'express'
import type { DataSource } from 'typeorm'
import { Clinica } from '../clinicas/clinicaEntity.js'
import { Consulta } from '../consultas/consultaEntity.js'
import { Especialista } from '../especialistas/EspecialistaEntity.js'
import { Paciente } from '../pacientes/pacienteEntity.js'
import { iniciaApp } from './helpers/app.js'
import { criaClinica, criaConsulta, criaEspecialista, criaPaciente, tokenDe } from './helpers/dados.js'

let app: Express
let dataSource: DataSource

let clinicaA: Clinica
let especialistaA: Especialista
let especialistaB: Especialista
let ana: Paciente
let bruno: Paciente
let consultaDoBruno: Consulta
let consultaDaAna: Consulta

const DADOS_SENSIVEIS_DO_PACIENTE = ['cpf', 'historico', 'senha']

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())

  clinicaA = await criaClinica(dataSource, 'Clinica A')
  const clinicaB = await criaClinica(dataSource, 'Clinica B')
  especialistaA = await criaEspecialista(dataSource, 'Dra A', 'CRM-A', clinicaA)
  especialistaB = await criaEspecialista(dataSource, 'Dr B', 'CRM-B', clinicaB)
  ana = await criaPaciente(dataSource, 'Ana Souza', cpf.generate(), ['nenhum'])
  bruno = await criaPaciente(dataSource, 'Bruno Lima', cpf.generate(), ['HIV positivo'])
  consultaDoBruno = await criaConsulta(dataSource, bruno, especialistaA)
  consultaDaAna = await criaConsulta(dataSource, ana, especialistaB)
})

afterAll(async () => {
  await dataSource?.destroy()
})

const autorizacao = (entidade: { id: string, role: any }): [string, string] =>
  ['Authorization', `Bearer ${tokenDe(entidade)}`]

function expectSemDadosSensiveis (paciente: Record<string, unknown>): void {
  for (const campo of DADOS_SENSIVEIS_DO_PACIENTE) {
    expect(paciente).not.toHaveProperty(campo)
  }
}

describe('listagem de pacientes (GET /paciente)', () => {
  test('não é pública', async () => {
    const resposta = await request(app).get('/paciente')

    expect(resposta.status).toBe(403)
  })

  test('não é acessível a pacientes', async () => {
    const resposta = await request(app).get('/paciente').set(...autorizacao(ana))

    expect(resposta.status).toBe(403)
  })

  test('mostra à clínica só os pacientes atendidos por ela, sem CPF, histórico e senha', async () => {
    const resposta = await request(app).get('/paciente').set(...autorizacao(clinicaA))

    expect(resposta.status).toBe(200)
    expect(resposta.body.map((p: Paciente) => p.id)).toEqual([bruno.id])
    resposta.body.forEach(expectSemDadosSensiveis)
    expect(resposta.body[0].nome).toBe('Bruno Lima')
  })

  test('mostra ao especialista só os pacientes atendidos por ele', async () => {
    const resposta = await request(app).get('/paciente').set(...autorizacao(especialistaB))

    expect(resposta.status).toBe(200)
    expect(resposta.body.map((p: Paciente) => p.id)).toEqual([ana.id])
    resposta.body.forEach(expectSemDadosSensiveis)
  })
})

describe('busca de paciente por nome (GET /paciente/consulta-por-paciente)', () => {
  test('não é pública', async () => {
    const resposta = await request(app).get('/paciente/consulta-por-paciente').query({ userInput: 'Bruno Lima' })

    expect(resposta.status).toBe(403)
    expect(JSON.stringify(resposta.body)).not.toContain('HIV positivo')
  })

  test('não devolve CPF, histórico e senha', async () => {
    const resposta = await request(app)
      .get('/paciente/consulta-por-paciente')
      .query({ userInput: 'Bruno Lima' })
      .set(...autorizacao(clinicaA))

    expect(resposta.status).toBe(200)
    expect(resposta.body).toHaveLength(1)
    expect(resposta.body[0].nome).toBe('Bruno Lima')
    expectSemDadosSensiveis(resposta.body[0])
  })

  test('não encontra pacientes que a clínica não atende', async () => {
    const resposta = await request(app)
      .get('/paciente/consulta-por-paciente')
      .query({ userInput: 'Ana Souza' })
      .set(...autorizacao(clinicaA))

    expect(resposta.status).toBe(404)
  })
})

describe('listagem de consultas (GET /consulta)', () => {
  test('não é pública', async () => {
    const resposta = await request(app).get('/consulta')

    expect(resposta.status).toBe(403)
    expect(JSON.stringify(resposta.body)).not.toContain('HIV positivo')
  })

  test('mostra à clínica só as consultas dos seus especialistas, sem dados sensíveis do paciente', async () => {
    const resposta = await request(app).get('/consulta').set(...autorizacao(clinicaA))

    expect(resposta.status).toBe(200)
    expect(resposta.body.map((c: Consulta) => c.id)).toEqual([consultaDoBruno.id])
    expect(resposta.body[0].paciente.nome).toBe('Bruno Lima')
    expectSemDadosSensiveis(resposta.body[0].paciente)
  })

  test('mostra ao paciente só as próprias consultas', async () => {
    const resposta = await request(app).get('/consulta').set(...autorizacao(ana))

    expect(resposta.status).toBe(200)
    expect(resposta.body.map((c: Consulta) => c.id)).toEqual([consultaDaAna.id])
  })
})

describe('detalhe de consulta (GET /consulta/:id)', () => {
  test('não devolve CPF, histórico e senha do paciente', async () => {
    const resposta = await request(app).get(`/consulta/${consultaDoBruno.id}`).set(...autorizacao(especialistaA))

    expect(resposta.status).toBe(200)
    expect(resposta.body.paciente.nome).toBe('Bruno Lima')
    expectSemDadosSensiveis(resposta.body.paciente)
  })
})

describe('respostas de cadastro', () => {
  test('o cadastro de clínica não devolve a senha', async () => {
    const resposta = await request(app).post('/clinica').send({
      nome: 'Clinica Nova',
      email: 'nova@teste.com',
      senha: 'Senha@123',
      endereco: { cep: 1001000, rua: 'Rua A', estado: 'SP', numero: 10, complemento: 'sala 1' }
    })

    expect(resposta.status).toBe(200)
    expect(resposta.body).not.toHaveProperty('senha')
  })

  test('o cadastro de especialista não devolve a senha', async () => {
    const resposta = await request(app)
      .post('/especialista')
      .set(...autorizacao(clinicaA))
      .send({
        nome: 'Dra Nova',
        crm: 'CRM-NOVO',
        imagem: '',
        especialidade: 'Pediatria',
        email: 'dranova@teste.com',
        telefone: '11999999999',
        estaAtivo: true,
        possuiPlanoSaude: false,
        senha: 'Senha@123',
        endereco: { cep: 1001000, rua: 'Rua A', estado: 'SP', numero: 10, complemento: 'sala 2' }
      })

    expect(resposta.status).toBe(200)
    expect(resposta.body).not.toHaveProperty('senha')
  })
})
