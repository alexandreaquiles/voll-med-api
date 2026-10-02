// Renovação da sessão com o refresh token, e respostas que permitem ao front saber quando renovar
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import type { Express } from 'express'
import type { DataSource } from 'typeorm'
import { Clinica } from '../clinicas/clinicaEntity.js'
import { iniciaApp } from './helpers/app.js'
import { criaClinica } from './helpers/dados.js'

let app: Express
let dataSource: DataSource
let clinica: Clinica

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())
  clinica = await criaClinica(dataSource, 'Clinica A')
})

afterAll(async () => {
  await dataSource?.destroy()
})

const login = async (): Promise<{ accessToken: string, refreshToken: string }> =>
  (await request(app).post('/auth/login').send({ email: clinica.email, senha: 'Senha@123' })).body

const rotaProtegida = async (token: string): Promise<request.Response> =>
  await request(app).get('/especialista').set('Authorization', `Bearer ${token}`)

describe('renovação da sessão (POST /auth/refresh)', () => {
  test('devolve um novo par de tokens, no mesmo formato do login', async () => {
    const { refreshToken } = await login()

    const resposta = await request(app).post('/auth/refresh').send({ refreshToken })

    expect(resposta.status).toBe(200)
    expect(typeof resposta.body.accessToken).toBe('string')
    expect(typeof resposta.body.refreshToken).toBe('string')
    expect((await rotaProtegida(resposta.body.accessToken)).status).toBe(200)
  })

  test('não aceita o mesmo refresh token duas vezes', async () => {
    const { refreshToken } = await login()
    await request(app).post('/auth/refresh').send({ refreshToken })

    const reuso = await request(app).post('/auth/refresh').send({ refreshToken })

    expect(reuso.status).toBe(401)
  })

  test('recusa refresh token inválido', async () => {
    expect((await request(app).post('/auth/refresh').send({ refreshToken: 'invalido' })).status).toBe(401)
  })
})

describe('token de acesso', () => {
  test('vencido recebe 401, para o front saber que deve renovar a sessão', async () => {
    const vencido = jwt.sign(
      { id: clinica.id, role: clinica.role, exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.SECRET_JWT as string
    )

    expect((await rotaProtegida(vencido)).status).toBe(401)
  })

  test('com assinatura inválida recebe 401', async () => {
    const falso = jwt.sign({ id: clinica.id, role: clinica.role }, 'outro-segredo', { expiresIn: '20m' })

    expect((await rotaProtegida(falso)).status).toBe(401)
  })
})

describe('logout (POST /auth/logout)', () => {
  test('não derruba outra sessão do mesmo usuário aberta no mesmo segundo', async () => {
    const agora = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
    const primeira = await login()
    const segunda = await login()
    agora.mockRestore()

    await request(app).post('/auth/logout').set('Authorization', `Bearer ${primeira.accessToken}`).send({ refreshToken: primeira.refreshToken })

    expect((await rotaProtegida(segunda.accessToken)).status).toBe(200)
  })

  test('invalida o token de acesso e o refresh token', async () => {
    const { accessToken, refreshToken } = await login()

    const resposta = await request(app).post('/auth/logout').set('Authorization', `Bearer ${accessToken}`).send({ refreshToken })

    expect(resposta.status).toBe(204)
    expect((await rotaProtegida(accessToken)).status).toBe(401)
    expect((await request(app).post('/auth/refresh').send({ refreshToken })).status).toBe(401)
  })
})
