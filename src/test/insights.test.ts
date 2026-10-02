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
let cardiologista: Especialista
let ana: Paciente

beforeAll(async () => {
  ({ app, dataSource } = await iniciaApp())

  clinicaA = await criaClinica(dataSource, 'Clinica A')
  const clinicaB = await criaClinica(dataSource, 'Clinica B')
  cardiologista = await criaEspecialista(dataSource, 'Dra Cardio', 'CRM-1', clinicaA, 'Cardiologia')
  const pediatra = await criaEspecialista(dataSource, 'Dr Pedi', 'CRM-2', clinicaA, 'Pediatria')
  const especialistaDaOutraClinica = await criaEspecialista(dataSource, 'Dr Outro', 'CRM-3', clinicaB, 'Cardiologia')
  ana = await criaPaciente(dataSource, 'Ana Souza', cpf.generate(), [])

  const marca = async (especialista: Especialista, data: string, motivoCancelamento?: string): Promise<Consulta> =>
    await criaConsulta(dataSource, ana, especialista, { data: new Date(data), motivoCancelamento })

  // Setembro: 2 cancelamentos em 4 consultas de cardiologia
  await marca(cardiologista, '2026-09-08T10:00:00.000Z', 'médico_cancelou')
  await marca(cardiologista, '2026-09-09T10:00:00.000Z', 'paciente_desistiu')
  await marca(cardiologista, '2026-09-10T10:00:00.000Z')
  await marca(cardiologista, '2026-09-11T10:00:00.000Z')
  // Outubro: 3 cancelamentos em 4 consultas de cardiologia, nenhum em pediatria
  await marca(cardiologista, '2026-10-06T10:00:00.000Z', 'médico_cancelou')
  await marca(cardiologista, '2026-10-07T10:00:00.000Z', 'médico_cancelou')
  await marca(cardiologista, '2026-10-08T10:00:00.000Z', 'paciente_desistiu')
  await marca(cardiologista, '2026-10-09T10:00:00.000Z')
  await marca(pediatra, '2026-10-13T10:00:00.000Z')
  // Outra clínica: não entra no resumo da clínica A
  await marca(especialistaDaOutraClinica, '2026-10-14T10:00:00.000Z', 'médico_cancelou')
})

afterAll(async () => {
  await dataSource?.destroy()
})

const autorizacao = (entidade: { id: string, role: any }): [string, string] =>
  ['Authorization', `Bearer ${tokenDe(entidade)}`]

describe('resumo de gestão (GET /admin/insights)', () => {
  test('não é público', async () => {
    const resposta = await request(app).get('/admin/insights')

    expect(resposta.status).toBe(403)
  })

  test('é exclusivo da clínica', async () => {
    for (const usuario of [ana, cardiologista]) {
      const resposta = await request(app).get('/admin/insights').set(...autorizacao(usuario))

      expect(resposta.status).toBe(403)
    }
  })

  test('recusa mês em formato inválido', async () => {
    const resposta = await request(app).get('/admin/insights').query({ mes: '10/2026' }).set(...autorizacao(clinicaA))

    expect(resposta.status).toBe(400)
  })

  test('resume em até 3 linhas os agendamentos e cancelamentos dos especialistas da clínica', async () => {
    const resposta = await request(app).get('/admin/insights').query({ mes: '2026-10' }).set(...autorizacao(clinicaA))

    expect(resposta.status).toBe(200)
    expect(resposta.body.mes).toBe('2026-10')
    expect(resposta.body.resumo).toEqual([
      'Em outubro de 2026 foram 5 consultas agendadas e 3 cancelamentos (60% de cancelamento), contra 50% em setembro de 2026.',
      'Houve um aumento de 50% nos cancelamentos em Cardiologia (de 2 para 3). Sugerimos revisar a escala de médicos.',
      'A maioria dos cancelamentos (2 de 3) partiu dos médicos. Sugerimos revisar a escala e as ausências da equipe.'
    ])
    expect(resposta.body.indicadores.atual).toEqual({
      agendadas: 5, canceladas: 3, motivos: { médico_cancelou: 2, paciente_desistiu: 1 }
    })
  })

  test('não envia dados de pacientes nos indicadores', async () => {
    const resposta = await request(app).get('/admin/insights').query({ mes: '2026-10' }).set(...autorizacao(clinicaA))

    expect(JSON.stringify(resposta.body)).not.toContain('Ana Souza')
    expect(JSON.stringify(resposta.body)).not.toContain(ana.cpf)
  })
})

describe('cancelamento de consulta (DELETE /consulta/:id)', () => {
  // Longe dos meses usados no resumo acima
  const DATA_FUTURA = new Date('2030-01-15T10:00:00.000Z')

  test('mantém a consulta registrada como cancelada, com o motivo', async () => {
    const consulta = await criaConsulta(dataSource, ana, cardiologista, { data: DATA_FUTURA })

    const resposta = await request(app)
      .delete(`/consulta/${consulta.id}`)
      .set(...autorizacao(ana))
      .send({ motivoCancelamento: 'paciente_desistiu' })

    expect(resposta.status).toBe(200)
    const noBanco = await dataSource.manager.findOneBy(Consulta, { id: consulta.id })
    expect(noBanco?.canceladaEm).toBeInstanceOf(Date)
    expect(noBanco?.motivoCancelamento).toBe('paciente_desistiu')
  })

  test('aceita o motivo pelo número do enum', async () => {
    const consulta = await criaConsulta(dataSource, ana, cardiologista, { data: DATA_FUTURA })

    await request(app).delete(`/consulta/${consulta.id}`).set(...autorizacao(ana)).send({ motivoCancelamento: 1 })

    expect((await dataSource.manager.findOneBy(Consulta, { id: consulta.id }))?.motivoCancelamento).toBe('médico_cancelou')
  })

  test('recusa motivo inexistente', async () => {
    const consulta = await criaConsulta(dataSource, ana, cardiologista, { data: DATA_FUTURA })

    const resposta = await request(app)
      .delete(`/consulta/${consulta.id}`)
      .set(...autorizacao(ana))
      .send({ motivoCancelamento: 'qualquer coisa' })

    expect(resposta.status).toBe(400)
    expect((await dataSource.manager.findOneBy(Consulta, { id: consulta.id }))?.canceladaEm).toBeNull()
  })

  test('não cancela duas vezes a mesma consulta', async () => {
    const consulta = await criaConsulta(dataSource, ana, cardiologista, { data: DATA_FUTURA, motivoCancelamento: 'outros' })

    const resposta = await request(app).delete(`/consulta/${consulta.id}`).set(...autorizacao(ana))

    expect(resposta.status).toBe(400)
  })

  test('tira a consulta cancelada das listagens', async () => {
    const consulta = await criaConsulta(dataSource, ana, cardiologista, { data: DATA_FUTURA })
    await request(app).delete(`/consulta/${consulta.id}`).set(...autorizacao(ana)).send({ motivoCancelamento: 'outros' })

    const consultas = await request(app).get('/consulta').set(...autorizacao(ana))
    const consultasDaAna = await request(app).get(`/paciente/${ana.id}/consultas`).set(...autorizacao(ana))

    expect(consultas.body.map((c: Consulta) => c.id)).not.toContain(consulta.id)
    expect(consultasDaAna.body.map((c: Consulta) => c.id)).not.toContain(consulta.id)
  })
})
