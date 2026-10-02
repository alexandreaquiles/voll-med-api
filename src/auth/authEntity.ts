import { ViewColumn, ViewEntity } from 'typeorm'
import { type IAutenticavel } from './IAutencavel'
import { Role } from './roles.js'

// Clínicas não têm situação: estão sempre ativas
const expression = process.env.DB_TYPE === 'sqlite'
  ? `
SELECT "email", "senha", "role", "id", "estaAtivo", '/paciente' AS "rota" FROM paciente
UNION ALL
SELECT "email", "senha", "role", "id", "estaAtivo", '/especialista' AS "rota" FROM especialista
UNION ALL
SELECT "email", "senha", "role", "id", 1 AS "estaAtivo", '/clinica' AS "rota" FROM clinica
`
  : `
SELECT email, senha, role, id, estaAtivo, '/paciente' AS 'rota' FROM paciente
UNION ALL
SELECT email, senha, role, id, estaAtivo, '/especialista' AS 'rota' FROM especialista
UNION ALL
SELECT email, senha, role, id, 1 AS estaAtivo, '/clinica' AS 'rota' FROM clinica
`
@ViewEntity({ expression })

export class Autenticaveis implements IAutenticavel {
  @ViewColumn()
    id: string

  @ViewColumn()
    email: string

  @ViewColumn()
    senha: string

  @ViewColumn()
    rota: string

  @ViewColumn()
    role: Role

  // Vem do banco como 1 ou 0
  @ViewColumn()
    estaAtivo: boolean | number
}
