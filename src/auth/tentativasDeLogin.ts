import { AppError, Status } from '../error/ErrorHandler.js'
import ClienteRedis from '../services/redis/redisClient.js'

// Depois de MAXIMO_DE_TENTATIVAS logins errados para o mesmo email, o login fica bloqueado
// até a contagem expirar. Um login certo zera a contagem.
const MAXIMO_DE_TENTATIVAS = 5
const MINUTOS_DE_BLOQUEIO = 15

const tentativas = new ClienteRedis('tentativas-de-login: ')

const chaveDo = (email: unknown): string => String(email ?? '').trim().toLowerCase()

export async function verificaTentativasDeLogin (email: unknown): Promise<void> {
  const quantidade = Number(await tentativas.buscaValor(chaveDo(email)) ?? 0)
  if (quantidade >= MAXIMO_DE_TENTATIVAS) {
    throw new AppError(`Muitas tentativas de login. Tente de novo em ${MINUTOS_DE_BLOQUEIO} minutos.`, Status.TOO_MANY_REQUESTS)
  }
}

export async function registraTentativaErrada (email: unknown): Promise<void> {
  await tentativas.incrementa(chaveDo(email), MINUTOS_DE_BLOQUEIO * 60)
}

export async function zeraTentativas (email: unknown): Promise<void> {
  await tentativas.deleta(chaveDo(email))
}
