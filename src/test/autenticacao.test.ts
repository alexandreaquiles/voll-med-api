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
})

afterAll(async () => {
  await dataSource?.destroy()
})

describe('autenticação', () => {
  // src/test/ambiente.ts configura só SECRET_JWT, a variável exigida na inicialização
  test('o token gerado no login é aceito pelas rotas protegidas', async () => {
    const login = await request(app).post('/auth/login').send({ email: 'clinicaa@teste.com', senha: 'Senha@123' })
    expect(login.status).toBe(200)

    const resposta = await request(app).get('/especialista').set('Authorization', `Bearer ${login.body.accessToken as string}`)

    expect(resposta.status).toBe(200)
  })
})
