// Senhas são guardadas como hash, que não pode ser revertido para a senha original.
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import request from 'supertest'
import type { Express } from 'express'
import type { DataSource, EntityTarget, ObjectLiteral } from 'typeorm'
import { Clinica } from '../clinicas/clinicaEntity.js'
import { Especialista } from '../especialistas/EspecialistaEntity.js'
import { Paciente } from '../pacientes/pacienteEntity.js'
import { iniciaApp } from './helpers/app.js'
import { criaClinica, tokenDe } from './helpers/dados.js'
import { senhaNoFormatoAntigo } from './helpers/senhaNoFormatoAntigo.js'
import { confereSenha, ehHashDeSenha, geraHashDeSenha } from '../utils/senhaUtils.js'
import { cpf } from 'cpf-cnpj-validator'

let app: Express
let dataSource: DataSource
let clinica: Clinica

const SENHA = 'Senha@123'
const ENDERECO = { cep: '01001000', rua: 'Praca da Se', estado: 'SP', numero: 1, complemento: 'lado impar' }

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())
  clinica = await criaClinica(dataSource, 'Clinica A')
})

afterAll(async () => {
  await dataSource?.destroy()
})

// A coluna senha não é carregada por padrão (select: false)
async function senhaGravada (entidade: EntityTarget<ObjectLiteral>, id: string): Promise<string> {
  const registro = await dataSource.manager.getRepository(entidade)
    .createQueryBuilder('registro')
    .addSelect('registro.senha')
    .where('registro.id = :id', { id })
    .getOneOrFail()
  return registro.senha
}

const ehHash = (senha: string): boolean => /^scrypt\$[^$]+\$[^$]+$/.test(senha)

describe('senhas gravadas nos cadastros', () => {
  test('a da clínica é um hash', async () => {
    const resposta = await request(app).post('/clinica').send({ nome: 'Clinica Nova', email: 'nova@teste.com', senha: SENHA, endereco: ENDERECO })

    const senha = await senhaGravada(Clinica, resposta.body.id)
    expect(ehHash(senha)).toBe(true)
    expect(senha).not.toContain(SENHA)
  })

  test('a do especialista é um hash', async () => {
    const resposta = await request(app)
      .post('/especialista')
      .set('Authorization', `Bearer ${tokenDe(clinica)}`)
      .send({
        nome: 'Dra Nova', crm: 'CRM-N', imagem: '', especialidade: 'Pediatria', email: 'dra@teste.com',
        telefone: '11999999999', estaAtivo: true, possuiPlanoSaude: false, senha: SENHA, endereco: ENDERECO
      })

    expect(ehHash(await senhaGravada(Especialista, resposta.body.id))).toBe(true)
  })

  test('a do paciente é um hash', async () => {
    const resposta = await request(app).post('/paciente').send({
      cpf: cpf.generate(), nome: 'Eva Teste', email: 'eva@teste.com', senha: SENHA,
      telefone: '11987654321', possuiPlanoSaude: false, endereco: ENDERECO
    })

    expect(ehHash(await senhaGravada(Paciente, resposta.body.id))).toBe(true)
  })

  test('a mesma senha gera hashes diferentes para usuários diferentes', async () => {
    const primeira = await request(app).post('/clinica').send({ nome: 'Clinica Um', email: 'um@teste.com', senha: SENHA, endereco: ENDERECO })
    const segunda = await request(app).post('/clinica').send({ nome: 'Clinica Dois', email: 'dois@teste.com', senha: SENHA, endereco: ENDERECO })

    expect(await senhaGravada(Clinica, primeira.body.id)).not.toBe(await senhaGravada(Clinica, segunda.body.id))
  })
})

describe('login', () => {
  test('aceita a senha certa e recusa a errada', async () => {
    await request(app).post('/clinica').send({ nome: 'Clinica Login', email: 'login@teste.com', senha: SENHA, endereco: ENDERECO })

    const certa = await request(app).post('/auth/login').send({ email: 'login@teste.com', senha: SENHA })
    const errada = await request(app).post('/auth/login').send({ email: 'login@teste.com', senha: 'Outra@123' })

    expect(certa.status).toBe(200)
    expect(errada.status).toBe(401)
  })

  test('aceita uma senha no formato antigo e a converte para hash', async () => {
    const antiga = await criaClinica(dataSource, 'Clinica Antiga')
    await dataSource.manager.update(Clinica, { id: antiga.id }, { senha: senhaNoFormatoAntigo(SENHA) })

    const primeiroLogin = await request(app).post('/auth/login').send({ email: antiga.email, senha: SENHA })

    expect(primeiroLogin.status).toBe(200)
    expect(ehHash(await senhaGravada(Clinica, antiga.id))).toBe(true)
    const segundoLogin = await request(app).post('/auth/login').send({ email: antiga.email, senha: SENHA })
    expect(segundoLogin.status).toBe(200)
  })

  test('não converte a senha no formato antigo quando o login falha', async () => {
    const antiga = await criaClinica(dataSource, 'Clinica Antiga Dois')
    const senhaAntiga = senhaNoFormatoAntigo(SENHA)
    await dataSource.manager.update(Clinica, { id: antiga.id }, { senha: senhaAntiga })

    const resposta = await request(app).post('/auth/login').send({ email: antiga.email, senha: 'Outra@123' })

    expect(resposta.status).toBe(401)
    expect(await senhaGravada(Clinica, antiga.id)).toBe(senhaAntiga)
  })
})

describe('senhaUtils', () => {
  test('confere a senha com o hash gerado', () => {
    const hash = geraHashDeSenha(SENHA)

    expect(confereSenha(SENHA, hash)).toBe(true)
    expect(confereSenha('Outra@123', hash)).toBe(false)
  })

  test('confere senhas no formato antigo', () => {
    const antiga = senhaNoFormatoAntigo(SENHA)

    expect(ehHashDeSenha(antiga)).toBe(false)
    expect(confereSenha(SENHA, antiga)).toBe(true)
    expect(confereSenha('Outra@123', antiga)).toBe(false)
  })

  test('recusa valores gravados que não são nem hash nem formato antigo', () => {
    expect(confereSenha(SENHA, SENHA)).toBe(false)
    expect(confereSenha(SENHA, '')).toBe(false)
  })

  test('gera hashes que cabem na coluna senha (100 caracteres)', () => {
    expect(geraHashDeSenha('x'.repeat(50)).length).toBeLessThanOrEqual(100)
  })
})
