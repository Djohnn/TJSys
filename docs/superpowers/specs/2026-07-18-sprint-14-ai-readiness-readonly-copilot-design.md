# Sprint 14 — IA Readiness e Copiloto Somente Leitura Design

## Objetivo

Preparar a fundação segura para IA futura no TJSys, começando por RAG documental e copiloto operacional somente leitura, sem autorização para executar ações transacionais.

## Escopo

A Sprint 14 não cria automação autônoma. Ela define fontes permitidas, classificação de dados, trilhas de auditoria, contratos de consulta e guardrails para que uma IA possa responder perguntas sobre documentação, operação e indicadores autorizados.

## Arquitetura

Criar uma camada `ai_core` ou `copilot` com separação clara entre:

- corpus documental versionado;
- read models autorizados;
- política de redaction;
- autorização por tenant/usuário;
- auditoria de perguntas e respostas;
- provedores LLM configuráveis no futuro.

Fluxo:

1. usuário faz pergunta;
2. sistema valida tenant, papel, escopo e fonte permitida;
3. dados sensíveis são filtrados/redigidos;
4. resposta é montada com citações internas;
5. interação é auditada;
6. nenhuma ação de escrita é executada.

## Fontes permitidas iniciais

- Documentação em `docs/`.
- Runbooks e relatórios operacionais.
- Read models financeiros/operacionais aprovados na Sprint 11.
- Métricas agregadas sem PII desnecessária.

## Regras de segurança

- IA não acessa banco livremente.
- IA não recebe certificados, tokens, senhas, chaves fiscais ou payloads restritos.
- Toda resposta de dados do tenant exige usuário autorizado.
- Toda interação relevante gera auditoria.
- Ações de escrita ficam fora do escopo até workflow de aprovação explícita.

## APIs previstas

- `POST /api/v1/copilot/query/`
- `GET /api/v1/copilot/sources/`
- `GET /api/v1/copilot/audit/`
- `POST /api/v1/copilot/feedback/`

## Fora do escopo

- Agentes executando venda, compra, fiscal ou financeiro.
- Treinamento/fine-tuning com dados reais de cliente.
- Acesso irrestrito ao banco.
- Recomendações automáticas de compra sem aprovação humana.

## Critérios de aceite

- Pergunta documental retorna resposta com fonte.
- Pergunta operacional só usa read model permitido.
- Usuário de outro tenant não acessa dados.
- Dados restritos são redigidos.
- Auditoria registra pergunta, fonte, usuário, tenant e correlação sem vazar segredo.
