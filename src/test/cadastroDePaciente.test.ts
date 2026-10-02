import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { cpf } from 'cpf-cnpj-validator'
import request from 'supertest'
import type { Express } from 'express'
import type { DataSource } from 'typeorm'
import { Endereco } from '../enderecos/enderecoEntity.js'
import { Paciente } from '../pacientes/pacienteEntity.js'
import { iniciaApp } from './helpers/app.js'

let app: Express
let dataSource: DataSource

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())
})

afterAll(async () => {
  await dataSource?.destroy()
})

const paciente = (cpfDoPaciente: string, email: string): Record<string, unknown> => ({
  cpf: cpfDoPaciente,
  nome: 'Eva Teste',
  email,
  senha: 'Senha@123',
  telefone: '11987654321',
  possuiPlanoSaude: false,
  endereco: { cep: '01001000', rua: 'Praca da Se', estado: 'SP', numero: 1, complemento: 'lado impar' }
})

describe('cadastro de paciente (POST /paciente)', () => {
  test('recusa CPF já cadastrado sem gravar nada', async () => {
    const mesmoCpf = cpf.generate()
    const primeiro = await request(app).post('/paciente').send(paciente(mesmoCpf, 'eva@teste.com'))
    expect(primeiro.status).toBe(202)
    const enderecosAntes = await dataSource.manager.count(Endereco)

    const segundo = await request(app).post('/paciente').send(paciente(mesmoCpf, 'outra.eva@teste.com'))

    expect(segundo.status).toBe(409)
    expect(segundo.body.message).toBe('Já existe um paciente com esse CPF!')
    expect(await dataSource.manager.count(Paciente)).toBe(1)
    expect(await dataSource.manager.count(Endereco)).toBe(enderecosAntes)
  })
})
