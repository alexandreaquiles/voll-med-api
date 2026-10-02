# Voll.Med API

API REST do sistema de clínicas Voll.Med (Express + TypeORM). O dashboard administrativo que consome esta API fica no repositório [voll-med-front](https://github.com/alexandreaquiles/voll-med-front).

## Pré-requisitos

- Node.js (testado com a versão 22)
- Docker, para rodar o Redis

## Rodando localmente

O jeito mais simples é usar SQLite como banco e rodar só o Redis no Docker.

### 1. Instale as dependências

```bash
npm install
```

### 2. Crie o arquivo `.env`

Na raiz do projeto:

```
DB_TYPE=sqlite
DB_PASSWORD=x
DB_DATABASE=x
SECRET_JWT=segredo-local
SECRET_KEY=segredo-local
SECRET_KEY_CRYPTO=chave-local
```

- `SECRET_JWT` e `SECRET_KEY` precisam ter **o mesmo valor**: os tokens são assinados com uma e verificados com a outra.
- `DB_PASSWORD` e `DB_DATABASE` não são usados com SQLite, mas a API não sobe sem eles.
- O banco fica em `src/database/database.sqlite`. Para usar outro arquivo, defina `DB_SQLITE_PATH`.
- O Redis é procurado em `redis://localhost:6379`. Para usar outro endereço, defina `REDIS_URL`.

### 3. Suba o Redis

```bash
docker run -d --rm --name redis-vollmed -p 6379:6379 redis:7
```

### 4. Popule o banco com dados de exemplo

```bash
npm run seed
```

São criadas duas clínicas, especialistas, pacientes e consultas no mês anterior e no atual, incluindo cancelamentos e consultas de hoje. As datas são calculadas a partir do dia em que o seed roda. O comando lista os usuários criados; a senha de todos é `Senha@123`.

| Usuário | Email |
|---|---|
| Gestor da Clínica Voll | `gestor@voll.com` |
| Gestor da Clínica Vizinha | `vizinha@voll.com` |

Se rodar de novo, o seed não duplica os dados. Para recriá-los, apague `src/database/database.sqlite` e rode outra vez.

### 5. Suba a API

```bash
npm start
```

A API fica em http://localhost:3000 e recompila a cada alteração no código.

### 6. Suba o front

Em outro terminal, no repositório [voll-med-front](https://github.com/alexandreaquiles/voll-med-front):

```bash
npm install
npm start
```

O front fica em http://localhost:3001 e repassa as chamadas para a API em `localhost:3000`. Entre em http://localhost:3001/login com `gestor@voll.com` / `Senha@123`. O dashboard mostra o Resumo de Gestão Inteligente, as consultas de hoje, o gráfico de consultas do mês e os especialistas da clínica.

### Para desligar

`Ctrl+C` nos terminais da API e do front, e `docker stop redis-vollmed`.

## Testes

```bash
npm test                                   # todos os testes
npm test -- src/test/insights.test.ts      # um arquivo
npm test -- -t "nome do teste"             # um teste pelo nome
```

Os testes usam SQLite em memória e um Redis simulado: não precisam do `.env`, do Docker nem da API rodando.

## Marcando consultas pela API

Além do seed, dá para criar consultas com `POST /consulta`. A API valida:

- a clínica funciona das **07h às 19h em UTC** (04h às 16h em Brasília), de segunda a sábado;
- a consulta precisa ser marcada com pelo menos 30 minutos de antecedência;
- cada paciente e cada especialista só pode ter uma consulta por dia;
- o cancelamento (`DELETE /consulta/:id`, com o token do paciente, do especialista ou da clínica) precisa de pelo menos 1 dia de antecedência. O motivo (`motivoCancelamento`) pode ser `paciente_desistiu`, `médico_cancelou` ou `outros`.

Exemplos de requisições estão em `src/docs/http_requests.json`.

## Problemas comuns

- **O dashboard abre direto ou mostra dados estranhos:** sobrou um token antigo no navegador. Clique em "Sair" ou limpe o `localStorage` de `localhost:3001`.
- **Erros de conexão com o Redis no log da API:** confira se o container está rodando com `docker ps`.
- **A API não sobe e reclama de variáveis de ambiente:** confira o `.env` do passo 2.

## Segurança

A auditoria de risco da API e as correções feitas estão em [docs/auditoria-risco.md](docs/auditoria-risco.md).
