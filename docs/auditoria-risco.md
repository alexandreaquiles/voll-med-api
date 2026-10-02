# Auditoria de risco: 3 falhas críticas na voll-med-api

Data: 02/10/2026

> **Status:** as três falhas foram corrigidas. Veja a seção [Correções](#correções) no fim do documento.

## Metodologia

Foram analisados as rotas, os middlewares e os controllers da API. Cada falha foi depois confirmada com requisições reais contra a API rodando localmente (SQLite e Redis no Docker).

O cenário de teste tinha uma clínica, uma especialista e dois pacientes, Ana e Bruno. A consulta do Bruno tinha "HIV positivo" no histórico médico.

## 1. BOLA (Broken Object Level Authorization): a mais grave

**Onde está:**

- O middleware `verificaTokenJWT` (`src/auth/middlewares/authMiddlewares.ts:32`) confere só o *papel* do usuário (`role`). Ele nunca confere se o `id` da URL pertence a quem está logado.
- Várias rotas nem usam o middleware: `GET /consulta/:id`, `GET /paciente/:id` e `GET /paciente/:id/consultas` (`src/consultas/consultaRoutes.ts:11`, `src/pacientes/pacienteRoutes.ts:27-28`).

**O que o teste mostrou:**

- **Sem token nenhum**, `GET /consulta/<id da consulta do Bruno>` devolveu 200 com nome, CPF, telefone e `historico: ["HIV positivo"]`.
- **Logada como Ana**, `PUT /paciente/<id do Bruno>` devolveu 200 e **sobrescreveu o histórico médico do Bruno** com "alterado pela Ana".
- Pela leitura do código, o `DELETE /paciente/:id` (`src/pacientes/pacienteController.ts:277-298`) tem a mesma falha: qualquer paciente logado apagaria o cadastro de outro. Esse caso não foi executado.

**Risco:** o BOLA permite que um usuário veja dados médicos de terceiros, o que viola frontalmente a LGPD e pode gerar multas pesadas. Dados de saúde são *dados pessoais sensíveis* (art. 5º, II), com regras mais rígidas de tratamento (art. 11). A falha também descumpre o dever de segurança (art. 46). As sanções do art. 52 vão até 2% do faturamento, limitadas a R$ 50 milhões por infração. Aqui o risco ainda é maior: além de ler, dá para **alterar** o prontuário de outra pessoa, o que compromete a integridade de um registro de saúde.

## 2. Exposição de dados sensíveis (Sensitive Data Exposure)

**Onde está:**

- `GET /paciente/consulta-por-paciente` (`src/pacientes/pacienteController.ts:14-31`) usa `SELECT *` em SQL puro. Com isso, ignora o `select: false` que protege a coluna `senha` na entidade.
- `GET /paciente` (`src/pacientes/pacienteController.ts:118-129`) lista todos os pacientes com CPF e histórico.
- `GET /consulta` (`src/consultas/consultaController.ts:63-70`) devolve o paciente completo dentro de cada consulta, porque a relação é `eager: true` (`src/consultas/consultaEntity.ts:25`).
- Nenhuma dessas rotas exige token.

**O que o teste mostrou (tudo sem token):**

- `GET /paciente` devolveu CPF e histórico médico de **todos** os pacientes.
- `GET /paciente/consulta-por-paciente?userInput=Bruno Lima` devolveu CPF, histórico e **a senha do Bruno**.
- `GET /consulta` devolveu todas as consultas com CPF e histórico de cada paciente.

**Risco:** qualquer pessoa na internet consegue baixar a base inteira de pacientes com CPF e diagnóstico, um vazamento em massa de dados sensíveis. A senha piora o quadro, porque ela é **criptografia reversível, não hash** (`src/utils/senhaUtils.ts`). Quem obtiver também a `SECRET_KEY_CRYPTO` recupera todas as senhas em texto puro. Como muita gente reutiliza senha, o incidente se estende a outros serviços. Um vazamento assim exige comunicação à ANPD e aos titulares (art. 48).

## 3. Mass Assignment

**O ataque clássico não funciona aqui.** Foram enviados `"role": "CLINICA"` e `"isAdmin": true`, tanto no cadastro quanto no `PUT` do próprio perfil, e o token continuou com `role: PACIENTE`. Os construtores das entidades fixam o papel (`src/pacientes/pacienteEntity.ts:91`, `src/especialistas/EspecialistaEntity.ts:91`).

**O que funciona:** os controllers copiam do `req.body` campos que o usuário não deveria controlar:

- `atualizarPaciente` (`src/pacientes/pacienteController.ts:184-227`) aceita `historico`, `cpf`, `estaAtivo` e `imagem`. O paciente reescreve o próprio prontuário, e combinado com o BOLA reescreve o de qualquer um.
- `criarPaciente` (`src/pacientes/pacienteController.ts:44-57`) aceita `historico` e `estaAtivo` já no cadastro. No teste, o paciente se cadastrou com um "diagnóstico inventado".
- `atualizarEspecialista` (`src/especialistas/especialistaController.ts:83-106`) aceita `crm`, `especialidade` e `estaAtivo`. No teste, a especialista logada trocou o próprio CRM para "999999-FALSO" e a especialidade para "Cardiologia", sem nenhuma validação da clínica.

**Risco:** o histórico médico deveria ser escrito só por profissionais de saúde. Com essa falha, ele fica sob controle do próprio paciente e, via BOLA, de terceiros. Isso fere o princípio da qualidade dos dados (LGPD, art. 6º, V). Já o CRM editável pelo próprio especialista permite que alguém se apresente com um registro profissional falso, com risco jurídico e assistencial para a clínica.

## Como corrigir, em resumo

1. **BOLA:** em toda rota com `:id`, exigir token e comparar `req.params.id` com `req.userId`, ou checar o vínculo (por exemplo, a consulta pertence ao paciente ou à clínica logada).
2. **Dados sensíveis:** exigir autenticação nas listagens, devolver DTOs sem CPF, histórico e senha, trocar o `SELECT *` por colunas explícitas e guardar a senha com hash (bcrypt ou argon2), não com criptografia reversível.
3. **Mass assignment:** usar uma lista de campos permitidos por papel. `historico` só pode ser escrito pelo especialista que atendeu, e `crm` e `estaAtivo` só pela clínica.

## Correções

Cada falha ganhou testes de integração que a reproduziam. Os testes falharam contra o código vulnerável, passaram depois da correção e foram commitados junto com ela.

| Falha | Testes | Antes da correção | Correção |
|---|---|---|---|
| BOLA | `src/test/bola.test.ts` | 22 de 25 falhavam | middleware `verificaProprioUsuario` nas rotas `/:id`; consultas só para quem participa delas (`src/consultas/consultaAcesso.ts`) |
| Exposição de dados sensíveis | `src/test/dadosSensiveis.test.ts` | 13 de 13 falhavam | listagens exigem token e mostram só os pacientes atendidos, sem CPF, histórico e senha; cadastros não devolvem senha |
| Mass assignment | `src/test/massAssignment.test.ts` | 5 de 6 falhavam | cada operação aceita só os campos que cabem ao papel autenticado |

Depois, `POST /consulta` e `POST /avaliacoes`, que recebiam o id do paciente no corpo sem exigir token, passaram a exigir login: o paciente só marca consultas e avalia em nome próprio, e a clínica só marca consultas com os seus especialistas (`src/test/agendamentoEAvaliacao.test.ts`).

Os tokens de login também passaram a ser assinados e verificados com a mesma variável, `SECRET_JWT`. Antes eram assinados com `SECRET_KEY`, e com valores diferentes nenhum token era aceito (`src/test/autenticacao.test.ts`).

Além das rotas citadas acima, a correção do BOLA cobriu casos do mesmo tipo encontrados durante o trabalho: `PATCH /especialista/:id` (sem token nenhum), `DELETE /especialista/:id`, as rotas de imagem do paciente e `PUT/DELETE/POST /clinica/:id`.

### Pendências

- **Senhas com criptografia reversível:** continuam em `src/utils/senhaUtils.ts`. Trocar por hash (bcrypt ou argon2) exige migrar as senhas já gravadas.
