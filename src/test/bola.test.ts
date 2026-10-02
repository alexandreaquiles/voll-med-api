// BOLA (Broken Object Level Authorization): um usuário autenticado não pode
// ler, alterar ou apagar recursos de outro usuário trocando o id na URL.
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
let clinicaB: Clinica
let especialistaA: Especialista
let especialistaB: Especialista
let ana: Paciente
let bruno: Paciente
let consultaDoBruno: Consulta

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())

  clinicaA = await criaClinica(dataSource, 'Clinica A')
  clinicaB = await criaClinica(dataSource, 'Clinica B')
  especialistaA = await criaEspecialista(dataSource, 'Dra A', 'CRM-A', clinicaA)
  especialistaB = await criaEspecialista(dataSource, 'Dr B', 'CRM-B', clinicaB)
  ana = await criaPaciente(dataSource, 'Ana Souza', cpf.generate(), ['nenhum'])
  bruno = await criaPaciente(dataSource, 'Bruno Lima', cpf.generate(), ['HIV positivo'])
  consultaDoBruno = await criaConsulta(dataSource, bruno, especialistaA)
})

afterAll(async () => {
  await dataSource?.destroy()
})

const autorizacao = (entidade: { id: string, role: any }): [string, string] =>
  ['Authorization', `Bearer ${tokenDe(entidade)}`]

describe('BOLA em /paciente/:id', () => {
  test('não mostra os dados de um paciente sem token', async () => {
    const resposta = await request(app).get(`/paciente/${bruno.id}`)

    expect(resposta.status).toBe(403)
  })

  test('não mostra os dados de um paciente para outro paciente', async () => {
    const resposta = await request(app).get(`/paciente/${bruno.id}`).set(...autorizacao(ana))

    expect(resposta.status).toBe(403)
    expect(JSON.stringify(resposta.body)).not.toContain('HIV positivo')
  })

  test('mostra os dados do paciente para ele mesmo', async () => {
    const resposta = await request(app).get(`/paciente/${bruno.id}`).set(...autorizacao(bruno))

    expect(resposta.status).toBe(200)
    expect(resposta.body.id).toBe(bruno.id)
  })

  test('não lista as consultas de um paciente para outro paciente', async () => {
    const resposta = await request(app).get(`/paciente/${bruno.id}/consultas`).set(...autorizacao(ana))

    expect(resposta.status).toBe(403)
  })

  test('lista as consultas do paciente para ele mesmo', async () => {
    const resposta = await request(app).get(`/paciente/${bruno.id}/consultas`).set(...autorizacao(bruno))

    expect(resposta.status).toBe(200)
    expect(resposta.body).toHaveLength(1)
  })

  test('não deixa um paciente alterar o cadastro de outro', async () => {
    const resposta = await request(app)
      .put(`/paciente/${bruno.id}`)
      .set(...autorizacao(ana))
      .send({
        cpf: bruno.cpf,
        nome: 'Bruno Lima',
        email: bruno.email,
        telefone: '11987654321',
        possuiPlanoSaude: false,
        estaAtivo: true,
        historico: ['alterado pela Ana']
      })

    expect(resposta.status).toBe(403)
    const brunoNoBanco = await dataSource.manager.findOneBy(Paciente, { id: bruno.id })
    expect(brunoNoBanco?.historico).toEqual(['HIV positivo'])
  })

  test('não deixa um paciente alterar o endereço de outro', async () => {
    const resposta = await request(app)
      .patch(`/paciente/${bruno.id}`)
      .set(...autorizacao(ana))
      .send({ cep: 1001000, rua: 'Rua da Ana', numero: 2, estado: 'SP', complemento: 'casa' })

    expect(resposta.status).toBe(403)
  })

  test('não deixa um paciente apagar outro', async () => {
    const resposta = await request(app).delete(`/paciente/${bruno.id}`).set(...autorizacao(ana))

    expect(resposta.status).toBe(403)
    expect(await dataSource.manager.findOneBy(Paciente, { id: bruno.id })).not.toBeNull()
  })

  test('não mostra as imagens de um paciente sem token', async () => {
    const resposta = await request(app).get(`/paciente/${bruno.id}/images`)

    expect(resposta.status).toBe(403)
  })

  test('não deixa um paciente apagar a imagem de outro', async () => {
    const resposta = await request(app).delete(`/paciente/${bruno.id}/images`).set(...autorizacao(ana))

    expect(resposta.status).toBe(403)
  })
})

describe('BOLA em /consulta/:id', () => {
  test('não mostra uma consulta sem token', async () => {
    const resposta = await request(app).get(`/consulta/${consultaDoBruno.id}`)

    expect(resposta.status).toBe(403)
    expect(JSON.stringify(resposta.body)).not.toContain('HIV positivo')
  })

  test('não mostra a consulta de um paciente para outro paciente', async () => {
    const resposta = await request(app).get(`/consulta/${consultaDoBruno.id}`).set(...autorizacao(ana))

    expect(resposta.status).toBe(403)
  })

  test('não mostra a consulta para um especialista que não atende o paciente', async () => {
    const resposta = await request(app).get(`/consulta/${consultaDoBruno.id}`).set(...autorizacao(especialistaB))

    expect(resposta.status).toBe(403)
  })

  test('não mostra a consulta para outra clínica', async () => {
    const resposta = await request(app).get(`/consulta/${consultaDoBruno.id}`).set(...autorizacao(clinicaB))

    expect(resposta.status).toBe(403)
  })

  test('mostra a consulta para o paciente, para o especialista e para a clínica envolvidos', async () => {
    for (const usuario of [bruno, especialistaA, clinicaA]) {
      const resposta = await request(app).get(`/consulta/${consultaDoBruno.id}`).set(...autorizacao(usuario))

      expect(resposta.status).toBe(200)
      expect(resposta.body.id).toBe(consultaDoBruno.id)
    }
  })

  test('não deixa um paciente cancelar a consulta de outro', async () => {
    const resposta = await request(app)
      .delete(`/consulta/${consultaDoBruno.id}`)
      .set(...autorizacao(ana))
      .send({ motivoCancelamento: 'outros' })

    expect(resposta.status).toBe(403)
    expect(await dataSource.manager.findOneBy(Consulta, { id: consultaDoBruno.id })).not.toBeNull()
  })
})

describe('BOLA em /especialista/:id', () => {
  test('não deixa um especialista alterar o cadastro de outro', async () => {
    const resposta = await request(app)
      .put(`/especialista/${especialistaA.id}`)
      .set(...autorizacao(especialistaB))
      .send({ nome: 'Alterado pelo B', telefone: '11900000000' })

    expect(resposta.status).toBe(403)
    const especialistaNoBanco = await dataSource.manager.findOneBy(Especialista, { id: especialistaA.id })
    expect(especialistaNoBanco?.nome).toBe('Dra A')
  })

  test('não deixa um especialista alterar o telefone de outro', async () => {
    const resposta = await request(app)
      .patch(`/especialista/${especialistaA.id}`)
      .set(...autorizacao(especialistaB))
      .send({ telefone: '11900000000' })

    expect(resposta.status).toBe(403)
    const especialistaNoBanco = await dataSource.manager.findOneBy(Especialista, { id: especialistaA.id })
    expect(especialistaNoBanco?.telefone).toBe('11999999999')
  })

  test('não deixa um especialista apagar outro', async () => {
    const resposta = await request(app).delete(`/especialista/${especialistaA.id}`).set(...autorizacao(especialistaB))

    expect(resposta.status).toBe(403)
    expect(await dataSource.manager.findOneBy(Especialista, { id: especialistaA.id })).not.toBeNull()
  })

  test('não deixa uma clínica apagar o especialista de outra clínica', async () => {
    const resposta = await request(app).delete(`/especialista/${especialistaA.id}`).set(...autorizacao(clinicaB))

    expect(resposta.status).toBe(403)
    expect(await dataSource.manager.findOneBy(Especialista, { id: especialistaA.id })).not.toBeNull()
  })
})

describe('BOLA em /clinica/:id', () => {
  test('não deixa alterar uma clínica sem token', async () => {
    const resposta = await request(app).put(`/clinica/${clinicaA.id}`).send({ email: 'invasor@teste.com', senha: 'x' })

    expect(resposta.status).toBe(403)
  })

  test('não deixa uma clínica alterar outra', async () => {
    const resposta = await request(app)
      .put(`/clinica/${clinicaA.id}`)
      .set(...autorizacao(clinicaB))
      .send({ email: 'invasor@teste.com', senha: 'x' })

    expect(resposta.status).toBe(403)
    const clinicaNoBanco = await dataSource.manager.findOneBy(Clinica, { id: clinicaA.id })
    expect(clinicaNoBanco?.email).toBe(clinicaA.email)
  })

  test('não deixa uma clínica vincular especialistas a outra clínica', async () => {
    const resposta = await request(app)
      .post(`/clinica/${clinicaA.id}/especialista`)
      .set(...autorizacao(clinicaB))
      .send({ especialistaId: especialistaB.id })

    expect(resposta.status).toBe(403)
  })

  test('não deixa uma clínica tomar para si o especialista de outra clínica', async () => {
    const resposta = await request(app)
      .post(`/clinica/${clinicaA.id}/especialista`)
      .set(...autorizacao(clinicaA))
      .send({ especialistaId: especialistaB.id })

    expect(resposta.status).toBe(403)
    const especialistaNoBanco = await dataSource.manager.findOne(Especialista, {
      where: { id: especialistaB.id },
      relations: { clinica: true }
    })
    expect(especialistaNoBanco?.clinica.id).toBe(clinicaB.id)
  })

  test('não deixa uma clínica apagar outra', async () => {
    const resposta = await request(app).delete(`/clinica/${clinicaA.id}`).set(...autorizacao(clinicaB))

    expect(resposta.status).toBe(403)
    expect(await dataSource.manager.findOneBy(Clinica, { id: clinicaA.id })).not.toBeNull()
  })
})
