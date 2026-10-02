import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import request from 'supertest'
import type { Express } from 'express'
import type { DataSource } from 'typeorm'
import { Clinica } from '../clinicas/clinicaEntity.js'
import { EMAIL_DO_GESTOR, populaBanco, SENHA_DE_EXEMPLO, type ResultadoDoSeed } from '../seed/dadosDeExemplo.js'
import { iniciaApp } from './helpers/app.js'
import { tokenDe } from './helpers/dados.js'

let app: Express
let dataSource: DataSource
let resultado: ResultadoDoSeed | null
let tokenDoGestor: string

// 15 de outubro de 2026, ao meio-dia no horário local
const HOJE = new Date(2026, 9, 15, 12)

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())
  resultado = await populaBanco(dataSource, HOJE)
  const clinica = await dataSource.manager.findOneByOrFail(Clinica, { email: EMAIL_DO_GESTOR })
  tokenDoGestor = tokenDe(clinica)
})

afterAll(async () => {
  await dataSource?.destroy()
})

describe('dados de exemplo (npm run seed)', () => {
  test('criam clínicas, especialistas, pacientes e consultas', () => {
    expect(resultado?.clinicas).toHaveLength(2)
    expect(resultado?.especialistas).toHaveLength(4)
    expect(resultado?.pacientes).toHaveLength(6)
    expect(resultado?.consultas).toBe(38)
  })

  test('não são criados de novo se já existirem', async () => {
    expect(await populaBanco(dataSource, HOJE)).toBeNull()
  })

  test('permitem entrar como gestor com a senha de exemplo', async () => {
    const resposta = await request(app).post('/auth/login').send({ email: EMAIL_DO_GESTOR, senha: SENHA_DE_EXEMPLO })

    expect(resposta.status).toBe(200)
    expect(resposta.body.rota).toBe('/clinica')
  })

  test('geram um resumo de gestão com aumento de cancelamentos e motivo predominante', async () => {
    const resposta = await request(app).get('/admin/insights').query({ mes: '2026-10' }).set('Authorization', `Bearer ${tokenDoGestor}`)

    expect(resposta.body.resumo).toEqual([
      'Em outubro de 2026 foram 18 consultas agendadas e 6 cancelamentos (33% de cancelamento), contra 17% em setembro de 2026.',
      'Houve um aumento de 150% nos cancelamentos em Cardiologia (de 2 para 5). Sugerimos revisar a escala de médicos.',
      'A maioria dos cancelamentos (4 de 6) partiu dos médicos. Sugerimos revisar a escala e as ausências da equipe.'
    ])
  })

  test('mostram ao gestor só as consultas ativas e os especialistas da sua clínica', async () => {
    const consultas = await request(app).get('/consulta').set('Authorization', `Bearer ${tokenDoGestor}`)
    const especialistas = await request(app).get('/especialista').set('Authorization', `Bearer ${tokenDoGestor}`)

    expect(consultas.body).toHaveLength(27)
    const deHoje = consultas.body.filter((c: { data: string }) => c.data.startsWith('2026-10-15'))
    expect(deHoje).toHaveLength(2)
    expect(especialistas.body.map((e: { nome: string }) => e.nome).sort()).toEqual(['Ana Cardoso', 'Bruno Prado', 'Carla Dias'])
  })
})
