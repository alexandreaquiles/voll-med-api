// Carregado pelo Jest antes de cada arquivo de teste (setupFiles).
// Precisa vir antes de qualquer import da aplicação: data-source.ts e authEntity.ts
// leem DB_TYPE no momento do import.
process.env.DB_TYPE = 'sqlite'
process.env.DB_SQLITE_PATH = ':memory:'
process.env.DB_PASSWORD = 'teste'
process.env.DB_DATABASE = 'teste'
process.env.SECRET_KEY_CRYPTO = 'chave-cripto-teste'
process.env.SECRET_JWT = 'segredo-jwt-teste'
