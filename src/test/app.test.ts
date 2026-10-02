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
  test('responde à listagem pública de especialistas', async () => {
    const resposta = await request(app).get('/especialista')

    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual([])
  })
})
