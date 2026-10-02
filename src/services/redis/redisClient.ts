import { type RedisClientType, createClient } from 'redis'
import jwt from 'jsonwebtoken'
import * as dotenv from 'dotenv'

// Os clientes são criados no import de tokens.ts, antes do dotenv.config() do server.ts
dotenv.config({ path: '.env' })

export default class ClienteRedis {
  private readonly cliente: RedisClientType
  private readonly prefixo: string

  constructor (prefixo: string) {
    this.cliente = createClient({
      url: process.env.REDIS_URL ?? 'redis://localhost:6379'
    })

    this.prefixo = prefixo

    this.cliente.on('error', err => {
      console.log('Allowlist Redis Client Error', err)
    })

    this.cliente.connect().then(() => {
      console.log('Allowlist Redis Client Connected')
    }).catch((err) => {
      console.log('Allowlist Redis Client Connection Error', err)
    })
  }

  async connect (): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.cliente.on('connect', resolve)
      this.cliente.on('error', reject)
    })
  }

  async adiciona (chave: string, valor, dataExpiracao): Promise<void> {
    if (valor == null && dataExpiracao == null) {
      dataExpiracao = jwt.decode(chave).exp
      valor = ''
    }
    await this.cliente.set(this.prefixo + chave, valor, { EX: dataExpiracao })
  }

  async buscaValor (chave: string): Promise<any> {
    return await this.cliente.get(this.prefixo + chave)
  }

  async contemChave (chave: string): Promise<boolean> {
    const resultado = await this.cliente.exists(this.prefixo + chave)
    return resultado === 1
  }

  // Soma 1 ao contador da chave; a contagem expira depois do tempo dado, a partir do primeiro incremento
  async incrementa (chave: string, segundosParaExpirar: number): Promise<number> {
    const valor = await this.cliente.incr(this.prefixo + chave)
    if (valor === 1) {
      await this.cliente.expire(this.prefixo + chave, segundosParaExpirar)
    }
    return valor
  }

  async deleta (chave: string): Promise<void> {
    await this.cliente.del(this.prefixo + chave)
  }
}
