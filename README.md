# TJSys

SaaS brasileiro de gestão comercial — Core ERP + módulos por segmento.

## Estado atual

- Fase: Sprint 1 — Autenticação, Onboarding e Autorização
- Ambos os diretórios `backend/`, `frontend/`, `pdv/` e `infra/` iniciados
- Documentação normativa: `docs/`

## Preparar o ambiente

```bash
# 1. Registrar a versão de Python usada
python --version        # requisito: ≥ 3.12

# 2. Subir a infraestrutura
cp .env.example .env
docker compose -f infra/compose.yaml up -d
docker compose -f infra/compose.yaml ps    # PostgreSQL e Redis saudáveis

# 3. Criar ambiente virtual e instalar dependências
python -m venv .venv
source .venv/bin/activate       # Linux / macOS
.venv\Scripts\activate          # Windows
pip install -e "backend[dev]"

# 4. Executar migrations com o papel proprietário
python backend/manage.py migrate --settings=config.settings.migration

# 5. Iniciar o servidor de desenvolvimento
python backend/manage.py runserver

# 6. Verificar saúde
curl http://localhost:8000/health/

# 7. Executar testes
pytest backend/tests/
```

## Papéis do PostgreSQL

- `POSTGRES_USER`: proprietário local, usado somente para bootstrap e migrations.
- `POSTGRES_APP_USER`: runtime Django sem `SUPERUSER`, `BYPASSRLS` ou propriedade das tabelas.
- `POSTGRES_TEST_USER`: cria apenas bancos efêmeros de teste e não ignora RLS.

O script `infra/postgres/init/001_roles.sh` cria os papéis restritos em instalações novas. Em bancos locais existentes, execute-o uma vez pelo contêiner PostgreSQL. Nunca use o papel proprietário para iniciar o servidor Django.

## Parar e limpar

```bash
docker compose -f infra/compose.yaml down
# Para remover volumes:
# docker compose -f infra/compose.yaml down -v
```

## Documentação

Ordem de leitura: Foundation Design → Product Governance → Project Charter
→ Product Vision → Product Strategy → Product Bible → ADRs → PRD Master →
SAD → DDD → SRS → API Standards → Test Strategy → Security → Operations.
Todos em `docs/`.

## Autenticação e MFA

O cadastro público cria usuário, tenant, empresa, filial e membership administrativa
na mesma transação. O administrador confirma o e-mail e configura MFA por TOTP ou
código de e-mail antes de acessar operações tenant-scoped.

Em produção, configure SMTP e `MFA_ENCRYPTION_KEY` externamente. A chave cifra
segredos TOTP e nunca deve entrar no Git, em logs, auditoria ou Outbox. Tokens de
confirmação, recuperação, convite e códigos de recuperação são persistidos somente
como digest.

## Regras

- Mudanças estruturais exigem ADR.
- Todo requisito deve possuir identificador verificável.
- Tenant, empresa e filial de uma entidade devem ser compatíveis.
- PDV opera online por padrão (ADR-003).
- Cliente contrata e paga provedor fiscal externo (ADR-004).
- IA permanece fora do MVP (ADR-005).
- Eventos usam Transactional Outbox (ADR-006).
