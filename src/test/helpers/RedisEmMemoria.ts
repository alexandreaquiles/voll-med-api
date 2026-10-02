// Substitui o ClienteRedis nos testes, guardando as chaves em memória
export default class RedisEmMemoria {
  private readonly chaves = new Map<string, string>()

  constructor (private readonly prefixo: string) {}

  async adiciona (chave: string, valor?: string): Promise<void> {
    this.chaves.set(this.prefixo + chave, valor ?? '')
  }

  async buscaValor (chave: string): Promise<string | null> {
    return this.chaves.get(this.prefixo + chave) ?? null
  }

  async contemChave (chave: string): Promise<boolean> {
    return this.chaves.has(this.prefixo + chave)
  }

  // A expiração não é simulada
  async incrementa (chave: string): Promise<number> {
    const valor = Number(this.chaves.get(this.prefixo + chave) ?? 0) + 1
    this.chaves.set(this.prefixo + chave, String(valor))
    return valor
  }

  async deleta (chave: string): Promise<void> {
    this.chaves.delete(this.prefixo + chave)
  }
}
