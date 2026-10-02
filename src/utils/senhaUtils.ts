import crypto from 'crypto'

// Senhas são gravadas como hash scrypt, com um sal aleatório por senha, no formato
// scrypt$<sal>$<hash> (base64; cabe nos 100 caracteres da coluna senha).
const PREFIXO = 'scrypt'
const TAMANHO_DO_SAL = 16
const TAMANHO_DO_HASH = 32

function geraHashDeSenha (senha: string): string {
  const sal = crypto.randomBytes(TAMANHO_DO_SAL)
  const hash = crypto.scryptSync(senha, sal, TAMANHO_DO_HASH)
  return `${PREFIXO}$${sal.toString('base64')}$${hash.toString('base64')}`
}

function ehHashDeSenha (senhaGravada: string): boolean {
  return senhaGravada.startsWith(`${PREFIXO}$`)
}

// Compara em tempo constante, para que o tempo de resposta não revele a senha
function iguais (a: Buffer, b: Buffer): boolean {
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Formato antigo: criptografia reversível com AES-256-GCM (<iv>:<dados><authTag>), com a chave
// SECRET_KEY_CRYPTO. Só é usado para conferir senhas ainda não migradas; o login as troca por hash.
function senhaNoFormatoAntigo (senhaGravada: string): string {
  const [ivHex, dadosCriptografados] = senhaGravada.split(':')
  const chave = crypto.scryptSync(process.env.SECRET_KEY_CRYPTO as string, 'salt', 32)
  const decifra = crypto.createDecipheriv('aes-256-gcm', chave, Buffer.from(ivHex, 'hex'))
  decifra.setAuthTag(Buffer.from(dadosCriptografados.slice(-32), 'hex'))
  return decifra.update(dadosCriptografados.slice(0, -32), 'hex', 'utf8') + decifra.final('utf8')
}

function confereSenha (senha: string, senhaGravada: string): boolean {
  if (ehHashDeSenha(senhaGravada)) {
    const [, sal, hash] = senhaGravada.split('$')
    const esperado = Buffer.from(hash, 'base64')
    return iguais(crypto.scryptSync(senha, Buffer.from(sal, 'base64'), esperado.length), esperado)
  }

  try {
    // Compara os hashes SHA-256 para que as duas entradas tenham o mesmo tamanho
    const sha256 = (texto: string): Buffer => crypto.createHash('sha256').update(texto).digest()
    return iguais(sha256(senha), sha256(senhaNoFormatoAntigo(senhaGravada)))
  } catch {
    return false
  }
}

export { geraHashDeSenha, ehHashDeSenha, confereSenha }
