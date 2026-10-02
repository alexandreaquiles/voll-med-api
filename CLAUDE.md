# CLAUDE.md

Este arquivo fornece orientações ao Claude Code (claude.ai/code) ao trabalhar com o código deste repositório.

API REST em Express + TypeORM (TypeScript, ESM) do sistema de clínicas Voll.Med.

## Comandos

```bash
npm install
npm start              # tsc-watch: compila src/ -> build/ e executa node ./build/server.js a cada build bem-sucedido
npm run compile        # build único com tsc
npm test               # jest via node --experimental-vm-modules (ESM)
npm test -- src/test/app.test.ts                     # um único arquivo de teste
npm test -- -t "nome do teste"                       # um único teste pelo nome
npx eslint src         # lint (standard-with-typescript)
npm run seed           # popula o banco do .env com dados de exemplo (src/seed/dadosDeExemplo.ts); não precisa de Redis
docker compose up -d --wait   # só a infraestrutura: MySQL (3306) e Redis (6379); a API roda fora do Docker
```

Testado com Node 22; o `Dockerfile` (não usado pelo compose) usa `node:19`. O passo a passo completo está no README.

## Ambiente obrigatório

`src/utils/serverUtils.ts` lança um erro na inicialização se `DB_TYPE`, `SECRET_JWT`, `SECRET_KEY_CRYPTO`, `DB_PASSWORD` e `DB_DATABASE` não estiverem definidas. Outras variáveis usadas: `DB_HOST`, `DB_PORT`, `DB_USER`, `SERVER_PORT` (padrão 3000; o `voll-med-front` espera a API nessa porta). As variáveis são lidas do `.env`, que está no gitignore; o `.env.example` traz os valores que batem com o `docker-compose.yaml` (MySQL `vollmed`/`vollmed`, banco `vollmed`).

- `DB_TYPE=sqlite` faz o `src/data-source.ts` usar SQLite em `./src/database/database.sqlite` (ou em `DB_SQLITE_PATH`; a pasta é criada se não existir). Qualquer outro valor usa MySQL. Ambos usam `synchronize: true` e não têm migrations, então mudanças nas entidades alteram o schema diretamente.
- A URL do Redis vem de `REDIS_URL` (padrão `redis://localhost:6379`), lida em `src/services/redis/redisClient.ts`. Os clientes Redis são criados já no import de `src/auth/tokens.ts`, antes do `dotenv.config()` do `server.ts`, por isso o `redisClient.ts` carrega o `.env` por conta própria.

## Arquitetura

- **Pastas por funcionalidade**: cada domínio em `src/<dominio>/` tem um `*Entity.ts` (TypeORM), um `*Controller.ts` (handlers que usam `AppDataSource.manager` diretamente; não há camada de service nem de repository) e um `*Routes.ts`. Cada módulo de rotas exporta por padrão `(app) => app.use('/<prefixo>', router)`, e o `src/server.ts` chama cada um explicitamente. Uma nova entidade precisa ser registrada nos dois arrays `entities` de `src/data-source.ts`.
- **Imports ESM**: `"type": "module"` e `module: ES2022` fazem com que imports relativos precisem da extensão `.js` mesmo em arquivos `.ts` (`import x from './foo.js'`). O `server.ts` usa `await` no nível superior.
- **Erros**: lance `AppError(mensagem, Status.X)` de `src/error/ErrorHandler.ts`. O `express-async-errors` repassa rejeições dos handlers assíncronos para `src/error/errorMiddleware.ts`, que formata a resposta JSON. Alguns controllers ainda capturam erros e respondem diretamente.
- **Autenticação** (`src/auth/`):
  - `Autenticaveis` é uma **ViewEntity** do TypeORM: um `UNION ALL` das tabelas `paciente`, `especialista` e `clinica`, com um dialeto SQL diferente para SQLite e MySQL. O login busca o email ali e retorna uma `rota` de acordo com o tipo de usuário.
  - Access tokens são JWTs (20 min) revogados por meio de uma blocklist no Redis. Refresh tokens são tokens opacos aleatórios (5 dias) mantidos em uma allowlist no Redis (`tokens.ts`).
  - As rotas são protegidas com `verificaTokenJWT(Role.x, ...)` (`middlewares/authMiddlewares.ts`), que define `req.userId` e `req.userRole` (tipados em `src/@types/express.d.ts`).
- **Autorização por recurso** (ver `docs/auditoria-risco.md` e os testes `src/test/bola.test.ts`, `dadosSensiveis.test.ts` e `massAssignment.test.ts`):
  - Rotas `/:id` de paciente, especialista e clínica usam `verificaTokenJWT(...)` seguido de `verificaProprioUsuario`, que exige `req.params.id === req.userId`. Quando a clínica também pode agir sobre o especialista (PUT/DELETE `/especialista/:id`), a checagem fica no controller.
  - Quem vê quais consultas (e, por consequência, quais pacientes) está em `src/consultas/consultaAcesso.ts`: o paciente vê as próprias, o especialista as que atende e a clínica as dos seus especialistas.
  - Respostas com dados de paciente fora do próprio paciente usam `resumoDoPaciente` (sem CPF, histórico e senha). Nenhuma resposta devolve `senha`.
  - Controllers leem do `req.body` só os campos que o papel autenticado pode alterar. Histórico médico, CPF, situação e papel do paciente não são editáveis por ele; CRM, especialidade e situação do especialista, só pela clínica dele.
- **Senhas** são gravadas como hash scrypt com sal aleatório (`utils/senhaUtils.ts`: `geraHashDeSenha` / `confereSenha`), no formato `scrypt$<sal>$<hash>` em base64, para caber nos 100 caracteres da coluna. Senhas no formato antigo (criptografia reversível com `SECRET_KEY_CRYPTO`, `<iv>:<dados>`) ainda são aceitas, e o login as troca por hash (`src/auth/login.ts`). Quando não houver mais nenhuma, `SECRET_KEY_CRYPTO` e esse caminho podem sair.
- **Entrada de paciente** passa por `pacienteSanitizations.ts`, depois pelo schema Yup em `pacienteYupSchema.ts`, com validação de CPF em `validacaoCPF.ts`.
- **Cancelamento de consulta** não apaga o registro: `DELETE /consulta/:id` chama `consulta.cancelar(motivo)`, que preenche `canceladaEm` e `motivoCancelamento` (nome do enum `MotivoCancelamento`, aceito também pelo número). Listagens e checagens de horário livre filtram `canceladaEm: IsNull()`.
- **Resumo de Gestão** (`src/insights/`, rota `GET /admin/insights?mes=AAAA-MM`, só para clínica): `calculaIndicadores` agrega as consultas dos especialistas da clínica por mês e especialidade (pela data da consulta, em UTC), e um `GeradorDeResumo` transforma os indicadores em até 3 linhas. Hoje é o `GeradorDeResumoSimulado`, com regras fixas; uma LLM pode substituí-lo implementando a mesma interface. Os indicadores não têm dados de pacientes.
- **Uploads**: o multer grava em `tmp/uploads/` (`src/config/multer.ts`), e `tmp/` é servido estaticamente.
- `src/docs/http_requests.json` é uma coleção de requisições de exemplo para os endpoints.

## Testes

Testes de integração em `src/test/*.test.ts`, com supertest contra o `app` exportado por `src/app.ts` (o `src/server.ts` só inicializa o banco e chama `listen`). Não precisam de banco nem de Redis externos:

- `src/test/ambiente.ts` (`setupFiles` do Jest) define as variáveis de ambiente, com SQLite em memória (`DB_SQLITE_PATH=:memory:`).
- `iniciaApp()` (`src/test/helpers/app.ts`) troca o `ClienteRedis` por `RedisEmMemoria` via `jest.unstable_mockModule` e só então importa a aplicação dinamicamente. Por isso os testes importam `app` por ele, nunca diretamente.
- `src/test/helpers/dados.ts` grava clínicas, especialistas, pacientes e consultas direto no banco (o cadastro de paciente pela API valida o CEP em um serviço externo) e gera tokens com `tokenDe()`.
- O Jest roda em modo ESM (`ts-jest/presets/default-esm`). O `moduleNameMapper` remove a extensão `.js` dos imports relativos. Use `jest` e os demais globais importando de `@jest/globals`.

## Ferramentas de segurança

Este é um projeto de curso de desenvolvimento seguro. No GitHub Actions, `testes.yaml` roda `npm test` e `tsc` a cada push e PR na `main`; em PRs para a `main` também rodam SonarQube e TruffleHog (`.github/workflows/`). Um hook de pre-commit (`.pre-commit-config.yaml`) executa o TruffleHog via Docker, e `trufflehog-exclude-path.txt` lista os caminhos que ele ignora.
