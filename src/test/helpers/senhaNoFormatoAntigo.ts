import crypto from 'crypto'

// Reproduz como as senhas eram gravadas antes do hash: criptografia reversível com AES-256-GCM,
// no formato <iv>:<dados><authTag>. Serve para testar a migração no login.
export function senhaNoFormatoAntigo (senha: string): string {
  const iv = crypto.randomBytes(12)
  const chave = crypto.scryptSync(process.env.SECRET_KEY_CRYPTO as string, 'salt', 32)
  const cifra = crypto.createCipheriv('aes-256-gcm', chave, iv)
  const dados = cifra.update(senha, 'utf8', 'hex') + cifra.final('hex')
  return `${iv.toString('hex')}:${dados}${cifra.getAuthTag().toString('hex')}`
}
