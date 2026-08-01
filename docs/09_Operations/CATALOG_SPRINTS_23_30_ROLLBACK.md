# Rollback — Catálogo Sprints 23–30

## Escopo

Aplica-se à branch `codex/fix-sprints-23-30`, incluindo a migração `catalog.0014_productimage_image`, upload de imagens, editor de produto, serviços, combos, canais e etiquetas.

## Pré-validação

1. Suspender novos cadastros de catálogo.
2. Registrar o commit implantado e executar `python manage.py audit_catalog_sprints_23_29`.
3. Fazer backup do PostgreSQL e do diretório/volume `MEDIA_ROOT`.

## Rollback de aplicação

1. Reimplantar o commit estável anterior.
2. Não reverter a migração 0014 enquanto houver arquivos enviados: o campo é compatível com a versão anterior e preserva dados.
3. Se a reversão estrutural for indispensável, primeiro exportar `catalog_productimage.image`, executar `python manage.py migrate catalog 0013` e conservar o backup de mídia.
4. Invalidar cache e reiniciar backend e frontend.

## Verificação

- Login + MFA e seleção de tenant.
- Listagem e edição de produto.
- Categorias, marcas e unidades.
- Venda no PDV e geração de cupom.
- `python manage.py audit_catalog_sprints_23_29` sem inconsistências.

## Recuperação

Restaurar banco e mídia do mesmo ponto no tempo. Nunca restaurar apenas um dos dois quando houver imagens criadas após o backup.
