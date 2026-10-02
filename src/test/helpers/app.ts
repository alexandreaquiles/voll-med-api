import { jest } from '@jest/globals'
import type { Express } from 'express'
import type { DataSource } from 'typeorm'

// Sobe a aplicação com SQLite em memória e Redis falso.
// Os imports são dinâmicos para que o mock do Redis seja registrado antes de tokens.ts ser carregado.
export async function iniciaApp (): Promise<{ app: Express, dataSource: DataSource }> {
  // Caminho absoluto: o jest resolveria um caminho relativo a partir do arquivo de teste, não deste helper
  const clienteRedis = new URL('../../services/redis/redisClient.ts', import.meta.url).pathname
  jest.unstable_mockModule(clienteRedis, async () => await import('./RedisEmMemoria.js'))
  // O cadastro de paciente valida o CEP em um serviço externo; nos testes, todo CEP é válido
  jest.unstable_mockModule('cep-promise', () => ({ default: async (cep: string) => ({ cep }) }))

  const { default: app } = await import('../../app.js')
  const { AppDataSource } = await import('../../data-source.js')
  await AppDataSource.initialize()

  return { app, dataSource: AppDataSource }
}
