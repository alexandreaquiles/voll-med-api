# CLAUDE.md

Este arquivo fornece orientações ao Claude Code (claude.ai/code) ao trabalhar com o código deste repositório.

API REST em Express + TypeORM (TypeScript, ESM) do sistema de clínicas Voll.Med.

## Comandos

```bash
npm install
npm start              # tsc-watch: compila src/ -> build/ e executa node ./build/server.js a cada build bem-sucedido
npm run compile        # build único com tsc
npm test               # jest via node --experimental-vm-modules (ESM)
npm test -- src/test/routes/pacienteRoutes.test.ts   # um único arquivo de teste
npm test -- -t "nome do teste"                       # um único teste pelo nome
npx eslint src         # lint (standard-with-typescript)
docker compose up      # MySQL (3306) + Redis (6379) + app (3000) + seed único a partir de population.sql
```

O README indica Node 16; o Dockerfile usa `node:19`.

## Ambiente obrigatório

`src/utils/serverUtils.ts` lança um erro na inicialização se `DB_TYPE`, `SECRET_JWT`, `SECRET_KEY_CRYPTO`, `DB_PASSWORD` e `DB_DATABASE` não estiverem definidas. Outras variáveis usadas: `DB_HOST`, `DB_PORT`, `DB_USER`, `SERVER_PORT`, `SECRET_KEY`. As variáveis são lidas do `.env`, que está no gitignore e não existe no repositório (o Dockerfile faz `COPY` dele, então o build Docker falha sem ele).

- `DB_TYPE=sqlite` faz o `src/data-source.ts` usar SQLite em `./src/database/database.sqlite`. Qualquer outro valor usa MySQL. Ambos usam `synchronize: true` e não têm migrations, então mudanças nas entidades alteram o schema diretamente.
- A URL do Redis está fixa como `redis://redis:6379` em `src/services/redis/redisClient.ts`, então só resolve dentro do docker-compose.

## Arquitetura

- **Pastas por funcionalidade**: cada domínio em `src/<dominio>/` tem um `*Entity.ts` (TypeORM), um `*Controller.ts` (handlers que usam `AppDataSource.manager` diretamente; não há camada de service nem de repository) e um `*Routes.ts`. Cada módulo de rotas exporta por padrão `(app) => app.use('/<prefixo>', router)`, e o `src/server.ts` chama cada um explicitamente. Uma nova entidade precisa ser registrada nos dois arrays `entities` de `src/data-source.ts`.
- **Imports ESM**: `"type": "module"` e `module: ES2022` fazem com que imports relativos precisem da extensão `.js` mesmo em arquivos `.ts` (`import x from './foo.js'`). O `server.ts` usa `await` no nível superior.
- **Erros**: lance `AppError(mensagem, Status.X)` de `src/error/ErrorHandler.ts`. O `express-async-errors` repassa rejeições dos handlers assíncronos para `src/error/errorMiddleware.ts`, que formata a resposta JSON. Alguns controllers ainda capturam erros e respondem diretamente.
- **Autenticação** (`src/auth/`):
  - `Autenticaveis` é uma **ViewEntity** do TypeORM: um `UNION ALL` das tabelas `paciente`, `especialista` e `clinica`, com um dialeto SQL diferente para SQLite e MySQL. O login busca o email ali e retorna uma `rota` de acordo com o tipo de usuário.
  - Access tokens são JWTs (20 min) revogados por meio de uma blocklist no Redis. Refresh tokens são tokens opacos aleatórios (5 dias) mantidos em uma allowlist no Redis (`tokens.ts`).
  - As rotas são protegidas com `verificaTokenJWT(Role.x, ...)` (`middlewares/authMiddlewares.ts`), que define `req.userId` e `req.userRole` (tipados em `src/@types/express.d.ts`).
  - Atenção: os tokens são **assinados** com `SECRET_KEY`, mas **verificados** com `SECRET_JWT`.
- **Senhas** são criptografadas de forma reversível com `SECRET_KEY_CRYPTO` (`utils/senhaUtils.ts`: `encryptPassword` / `decryptPassword`), e não armazenadas como hash.
- **Entrada de paciente** passa por `pacienteSanitizations.ts`, depois pelo schema Yup em `pacienteYupSchema.ts`, com validação de CPF em `validacaoCPF.ts`.
- **Uploads**: o multer grava em `tmp/uploads/` (`src/config/multer.ts`), e `tmp/` é servido estaticamente.
- `src/docs/http_requests.json` é uma coleção de requisições de exemplo para os endpoints.

## Testes

O único teste é `src/test/routes/pacienteRoutes.test.ts`. Ele importa o `server.ts`, que sobe a aplicação inteira, então precisa das variáveis de ambiente, de um banco de dados e do Redis.

## Ferramentas de segurança

Este é um projeto de curso de desenvolvimento seguro. A CI em PRs para a `main` executa SonarQube e TruffleHog (`.github/workflows/`). Um hook de pre-commit (`.pre-commit-config.yaml`) executa o TruffleHog via Docker, e `trufflehog-exclude-path.txt` lista os caminhos que ele ignora.
