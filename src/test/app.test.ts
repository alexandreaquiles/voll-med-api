import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import request from 'supertest'
import type { Express } from 'express'
import type { DataSource } from 'typeorm'
import { iniciaApp } from './helpers/app.js'

let app: Express
let dataSource: DataSource

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())
})

afterAll(async () => {
  await dataSource?.destroy()
})

describe('aplicação', () => {
  test('responde à listagem pública de clínicas', async () => {
    const resposta = await request(app).get('/clinica')

    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual([])
  })
})
