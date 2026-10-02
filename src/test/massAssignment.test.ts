// Mass assignment: o usuário não pode definir, pelo corpo da requisição, campos
// que não lhe cabem, como o próprio papel, o histórico médico ou o CRM.
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
let clinicaB: Clinica

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())

  clinicaA = await criaClinica(dataSource, 'Clinica A')
  clinicaB = await criaClinica(dataSource, 'Clinica B')
})

afterAll(async () => {
  await dataSource?.destroy()
})

const autorizacao = (entidade: { id: string, role: any }): [string, string] =>
  ['Authorization', `Bearer ${tokenDe(entidade)}`]

const pacienteNoBanco = async (id: string): Promise<Paciente | null> =>
  await dataSource.manager.findOneBy(Paciente, { id })

const especialistaNoBanco = async (id: string): Promise<Especialista | null> =>
  await dataSource.manager.findOne(Especialista, { where: { id }, relations: { clinica: true } })

describe('cadastro de paciente (POST /paciente)', () => {
  test('ignora papel, histórico e situação enviados no corpo', async () => {
    const resposta = await request(app).post('/paciente').send({
      cpf: cpf.generate(),
      nome: 'Eva Teste',
      email: 'eva@teste.com',
      senha: 'Senha@123',
      telefone: '11987654321',
      possuiPlanoSaude: false,
      role: 'CLINICA',
      isAdmin: true,
      estaAtivo: false,
      historico: ['diagnóstico inventado'],
      endereco: { cep: '01001000', rua: 'Praca da Se', estado: 'SP', numero: 1, complemento: 'lado impar' }
    })

    expect(resposta.status).toBe(202)
    const eva = await pacienteNoBanco(resposta.body.id)
    expect(eva?.role).toBe('PACIENTE')
    expect(eva).not.toHaveProperty('isAdmin')
    expect(eva?.estaAtivo).toBe(true)
    expect(eva?.historico ?? []).toEqual([])
  })
})

describe('atualização do próprio paciente (PUT /paciente/:id)', () => {
  test('atualiza os dados de contato, mas não o histórico, o CPF, a situação e o papel', async () => {
    const bruno = await criaPaciente(dataSource, 'Bruno Lima', cpf.generate(), ['HIV positivo'])
    bruno.estaAtivo = false
    await dataSource.manager.save(Paciente, bruno)

    const resposta = await request(app)
      .put(`/paciente/${bruno.id}`)
      .set(...autorizacao(bruno))
      .send({
        cpf: cpf.generate(),
        nome: 'Bruno Lima Atualizado',
        email: 'bruno.novo@teste.com',
        telefone: '11911112222',
        possuiPlanoSaude: false,
        estaAtivo: true,
        historico: ['nenhum'],
        role: 'CLINICA',
        isAdmin: true
      })

    expect(resposta.status).toBe(200)
    const brunoNoBanco = await pacienteNoBanco(bruno.id)
    expect(brunoNoBanco?.nome).toBe('Bruno Lima Atualizado')
    expect(brunoNoBanco?.email).toBe('bruno.novo@teste.com')
    expect(brunoNoBanco?.telefone).toBe('11911112222')
    expect(brunoNoBanco?.historico).toEqual(['HIV positivo'])
    expect(brunoNoBanco?.cpf).toBe(bruno.cpf)
    expect(brunoNoBanco?.estaAtivo).toBe(false)
    expect(brunoNoBanco?.role).toBe('PACIENTE')
  })
})

describe('atualização de especialista (PUT /especialista/:id)', () => {
  const alteracoes = {
    nome: 'Dra A Atualizada',
    telefone: '11933334444',
    crm: '999999-FALSO',
    especialidade: 'Cardiologia',
    estaAtivo: false
  }

  test('o especialista atualiza os próprios dados, mas não o CRM, a especialidade e a situação', async () => {
    const especialista = await criaEspecialista(dataSource, 'Dra A', 'CRM-1', clinicaA)

    const resposta = await request(app)
      .put(`/especialista/${especialista.id}`)
      .set(...autorizacao(especialista))
      .send(alteracoes)

    expect(resposta.status).toBe(200)
    const noBanco = await especialistaNoBanco(especialista.id)
    expect(noBanco?.nome).toBe('Dra A Atualizada')
    expect(noBanco?.telefone).toBe('11933334444')
    expect(noBanco?.crm).toBe('CRM-1')
    expect(noBanco?.especialidade).toBe('Clínico Geral')
    expect(noBanco?.estaAtivo).toBe(true)
  })

  test('a clínica do especialista atualiza o CRM, a especialidade e a situação', async () => {
    const especialista = await criaEspecialista(dataSource, 'Dra A', 'CRM-2', clinicaA)

    const resposta = await request(app)
      .put(`/especialista/${especialista.id}`)
      .set(...autorizacao(clinicaA))
      .send(alteracoes)

    expect(resposta.status).toBe(200)
    const noBanco = await especialistaNoBanco(especialista.id)
    expect(noBanco?.crm).toBe('999999-FALSO')
    expect(noBanco?.especialidade).toBe('Cardiologia')
    expect(noBanco?.estaAtivo).toBe(false)
  })

  test('outra clínica não atualiza o especialista', async () => {
    const especialista = await criaEspecialista(dataSource, 'Dra A', 'CRM-3', clinicaA)

    const resposta = await request(app)
      .put(`/especialista/${especialista.id}`)
      .set(...autorizacao(clinicaB))
      .send(alteracoes)

    expect(resposta.status).toBe(403)
    expect((await especialistaNoBanco(especialista.id))?.crm).toBe('CRM-3')
  })
})

describe('cadastro de especialista (POST /especialista)', () => {
  test('vincula o especialista à clínica que o cadastrou, e não à enviada no corpo', async () => {
    const resposta = await request(app)
      .post('/especialista')
      .set(...autorizacao(clinicaA))
      .send({
        nome: 'Dr Novo',
        crm: 'CRM-NOVO',
        imagem: '',
        especialidade: 'Pediatria',
        email: 'drnovo@teste.com',
        telefone: '11999999999',
        estaAtivo: true,
        possuiPlanoSaude: false,
        senha: 'Senha@123',
        role: 'CLINICA',
        clinica: { id: clinicaB.id }
      })

    expect(resposta.status).toBe(200)
    const noBanco = await especialistaNoBanco(resposta.body.id)
    expect(noBanco?.clinica?.id).toBe(clinicaA.id)
    expect(noBanco?.role).toBe('ESPECIALISTA')
  })
})
