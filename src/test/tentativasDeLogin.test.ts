// Limite de tentativas de login: protege as contas contra quem tenta adivinhar a senha
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import request from 'supertest'
import type { Express } from 'express'
import type { DataSource } from 'typeorm'
import { iniciaApp } from './helpers/app.js'
import { criaClinica } from './helpers/dados.js'

let app: Express
let dataSource: DataSource

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())
  await criaClinica(dataSource, 'Clinica A')
  await criaClinica(dataSource, 'Clinica B')
})

afterAll(async () => {
  await dataSource?.destroy()
})

const login = async (email: string, senha: string): Promise<request.Response> =>
  await request(app).post('/auth/login').send({ email, senha })

describe('limite de tentativas de login', () => {
  test('bloqueia o email depois de 5 tentativas erradas, mesmo com a senha certa', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login('clinicaa@teste.com', 'Errada@123')).status).toBe(401)
    }

    const bloqueado = await login('clinicaa@teste.com', 'Senha@123')

    expect(bloqueado.status).toBe(429)
    expect(bloqueado.body.message).toBe('Muitas tentativas de login. Tente de novo em 15 minutos.')
  })

  test('não bloqueia outros emails', async () => {
    expect((await login('clinicab@teste.com', 'Senha@123')).status).toBe(200)
  })

  test('zera a contagem depois de um login certo', async () => {
    for (let i = 0; i < 4; i++) {
      await login('clinicab@teste.com', 'Errada@123')
    }
    expect((await login('clinicab@teste.com', 'Senha@123')).status).toBe(200)

    for (let i = 0; i < 4; i++) {
      expect((await login('clinicab@teste.com', 'Errada@123')).status).toBe(401)
    }
    expect((await login('clinicab@teste.com', 'Senha@123')).status).toBe(200)
  })

  test('conta as tentativas sem diferenciar maiúsculas no email', async () => {
    for (let i = 0; i < 5; i++) {
      await login('Ninguem@Teste.com', 'Errada@123')
    }

    expect((await login('ninguem@teste.com', 'Errada@123')).status).toBe(429)
  })
})
