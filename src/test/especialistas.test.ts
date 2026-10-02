import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { cpf } from 'cpf-cnpj-validator'
import request from 'supertest'
import type { Express } from 'express'
import type { DataSource } from 'typeorm'
import { Clinica } from '../clinicas/clinicaEntity.js'
import { Especialista } from '../especialistas/EspecialistaEntity.js'
import { Paciente } from '../pacientes/pacienteEntity.js'
import { iniciaApp } from './helpers/app.js'
import { criaClinica, criaEspecialista, criaPaciente, tokenDe } from './helpers/dados.js'

let app: Express
let dataSource: DataSource

let clinicaA: Clinica
let especialistaA: Especialista
let ana: Paciente

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())

  clinicaA = await criaClinica(dataSource, 'Clinica A')
  const clinicaB = await criaClinica(dataSource, 'Clinica B')
  especialistaA = await criaEspecialista(dataSource, 'Dra A', 'CRM-A', clinicaA)
  await criaEspecialista(dataSource, 'Dr B', 'CRM-B', clinicaB)
  ana = await criaPaciente(dataSource, 'Ana Souza', cpf.generate(), [])
})

afterAll(async () => {
  await dataSource?.destroy()
})

const autorizacao = (entidade: { id: string, role: any }): [string, string] =>
  ['Authorization', `Bearer ${tokenDe(entidade)}`]

describe('listagem de especialistas (GET /especialista)', () => {
  test('não é pública', async () => {
    const resposta = await request(app).get('/especialista')

    expect(resposta.status).toBe(403)
  })

  test('é exclusiva de clínicas', async () => {
    const resposta = await request(app).get('/especialista').set(...autorizacao(ana))

    expect(resposta.status).toBe(403)
  })

  test('mostra à clínica só os seus especialistas, sem senha', async () => {
    const resposta = await request(app).get('/especialista').set(...autorizacao(clinicaA))

    expect(resposta.status).toBe(200)
    expect(resposta.body.map((e: Especialista) => e.id)).toEqual([especialistaA.id])
    expect(resposta.body[0]).not.toHaveProperty('senha')
  })
})
