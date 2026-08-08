# Design — Política inicial de arquivos ignorados

**Status:** Approved for review  
**Data:** 2026-07-14  
**Escopo:** `.gitignore` raiz do TJSys

## Objetivo

Impedir o versionamento acidental de segredos, dados operacionais locais, dependências, caches e artefatos gerados pela stack definida, sem ocultar código-fonte, documentação ou exemplos seguros de configuração.

## Abordagem aprovada

Adotar uma política completa e comentada para o monorepositório futuro, cobrindo:

- Python, Django, testes, cobertura, ambientes virtuais e ferramentas de análise;
- Node.js, React, Electron e gerenciadores de pacotes;
- builds, empacotamento desktop, instaladores e mapas de código;
- `.env` e variantes locais, preservando arquivos `*.example` e `*.sample`;
- certificados, chaves privadas e credenciais fiscais;
- bancos SQLite, journals e dados locais do PDV;
- mídia, uploads, arquivos estáticos coletados, logs, temporários e backups locais;
- configurações locais de IDE e sistema operacional;
- volumes e overrides locais de contêineres;
- ZIPs e demais pacotes produzidos para entrega.

## Regras de segurança

1. Certificados e chaves reais nunca serão versionados.
2. Arquivos de exemplo não conterão valores válidos e poderão ser versionados.
3. Migrations Django, lockfiles de dependências e código-fonte não serão ignorados.
4. Dados persistidos pelo PDV local serão ignorados, mas schemas e migrations do SQLite permanecerão versionáveis quando forem criados como código.
5. O pacote `Milestone_001_Documentation_Foundation_v0.1.0.zip` permanecerá local e será abrangido pela regra de artefatos compactados.

## Estrutura

O arquivo será dividido em seções comentadas por tecnologia. As regras específicas aparecerão antes das exceções com `!`, facilitando auditoria e manutenção.

## Verificação

- `git check-ignore -v` confirmará proteção de `.env`, certificados, SQLite e ZIPs.
- Arquivos de exemplo, migrations e documentação serão testados para garantir que não sejam ignorados.
- `git status --short` deverá deixar de listar o ZIP atual sem ocultar fontes já rastreadas.

## Fora do escopo

- criação dos arquivos de ambiente;
- scaffold Django, React ou Electron;
- gestão de segredos em produção;
- alteração do histórico Git para remover segredos previamente publicados.
