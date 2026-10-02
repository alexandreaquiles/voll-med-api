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

  async deleta (chave: string): Promise<void> {
    this.chaves.delete(this.prefixo + chave)
  }
}
