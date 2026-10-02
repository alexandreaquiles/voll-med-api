// DELETE /paciente/:id desativa o paciente: o cadastro e as consultas continuam, mas ele não entra mais
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { cpf } from 'cpf-cnpj-validator'
import request from 'supertest'
import type { Express } from 'express'
import type { DataSource } from 'typeorm'
import { Consulta } from '../consultas/consultaEntity.js'
import { Especialista } from '../especialistas/EspecialistaEntity.js'
import { Paciente } from '../pacientes/pacienteEntity.js'
import { iniciaApp } from './helpers/app.js'
import { criaClinica, criaConsulta, criaEspecialista, criaPaciente } from './helpers/dados.js'

let app: Express
let dataSource: DataSource
let especialista: Especialista

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())
  especialista = await criaEspecialista(dataSource, 'Dra A', 'CRM-A', await criaClinica(dataSource, 'Clinica A'))
})

afterAll(async () => {
  await dataSource?.destroy()
})

const login = async (email: string): Promise<request.Response> =>
  await request(app).post('/auth/login').send({ email, senha: 'Senha@123' })

describe('desativação de paciente (DELETE /paciente/:id)', () => {
  test('mantém o paciente e as consultas, só marcando-o como inativo', async () => {
    const paciente = await criaPaciente(dataSource, 'Ana Souza', cpf.generate(), ['asma'])
    const consulta = await criaConsulta(dataSource, paciente, especialista)
    const { accessToken } = (await login(paciente.email)).body

    const resposta = await request(app).delete(`/paciente/${paciente.id}`).set('Authorization', `Bearer ${accessToken as string}`)

    expect(resposta.status).toBe(200)
    expect(resposta.body.message).toBe('Paciente desativado!')
    const noBanco = await dataSource.manager.findOneBy(Paciente, { id: paciente.id })
    expect(noBanco?.estaAtivo).toBe(false)
    expect(noBanco?.historico).toEqual(['asma'])
    expect(await dataSource.manager.findOneBy(Consulta, { id: consulta.id })).not.toBeNull()
  })

  test('invalida o token usado para desativar', async () => {
    const paciente = await criaPaciente(dataSource, 'Bruno Lima', cpf.generate(), [])
    const { accessToken } = (await login(paciente.email)).body
    const autorizacao: [string, string] = ['Authorization', `Bearer ${accessToken as string}`]

    await request(app).delete(`/paciente/${paciente.id}`).set(...autorizacao)
    const depois = await request(app).get(`/paciente/${paciente.id}`).set(...autorizacao)

    expect(depois.status).toBe(401)
  })

  test('impede o paciente desativado de entrar de novo', async () => {
    const paciente = await criaPaciente(dataSource, 'Carla Dias', cpf.generate(), [])
    const { accessToken, refreshToken } = (await login(paciente.email)).body

    await request(app).delete(`/paciente/${paciente.id}`).set('Authorization', `Bearer ${accessToken as string}`)

    const novoLogin = await login(paciente.email)
    expect(novoLogin.status).toBe(401)
    expect(novoLogin.body.message).toBe('Email ou senha inválidos')
    const renovacao = await request(app).post('/auth/refresh').send({ refreshToken })
    expect(renovacao.status).toBe(401)
  })
})

describe('login de usuários inativos', () => {
  test('recusa especialista desativado pela clínica', async () => {
    const desativado = await criaEspecialista(dataSource, 'Dr Inativo', 'CRM-I')
    await dataSource.manager.update(Especialista, { id: desativado.id }, { estaAtivo: false })

    expect((await login(desativado.email)).status).toBe(401)
  })
})
