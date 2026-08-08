# Infra

Configuração de infraestrutura local e de ambientes do TJSys.

- `compose.yaml`: PostgreSQL e Redis versionados para uso local.
- Variáveis sensíveis exclusivamente via `.env` (não versionado).
- Volumes persistidos mantidos fora do Git (ver `.gitignore`).

Para subir o ambiente:

```bash
cp .env.example ../.env
docker compose -f infra/compose.yaml config
docker compose -f infra/compose.yaml up -d
docker compose -f infra/compose.yaml ps
docker compose -f infra/compose.yaml down
```
