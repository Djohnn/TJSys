# C4 — Contexto do Sistema

**ID:** DIA-001  
**Versão:** 0.1.0  
**Status:** Review

```mermaid
flowchart LR
    operador["Operador / Vendedor"]
    gestor["Gestor do estabelecimento"]
    contador["Contador"]
    suporte["Equipe da plataforma"]
    erp["TJSys\nERP SaaS multi-tenant"]
    fiscal["Provedor fiscal externo"]
    sefaz["SEFAZ"]
    pagamentos["Provedores de pagamento"]
    notificacoes["E-mail / mensageria"]

    operador -->|"Vendas e caixa"| erp
    gestor -->|"Cadastros, estoque e gestão"| erp
    contador -->|"Consulta e exportações autorizadas"| erp
    suporte -->|"Operação auditada"| erp
    erp -->|"Emissão e consulta fiscal"| fiscal
    fiscal -->|"Documentos fiscais"| sefaz
    erp -->|"Cobranças futuras"| pagamentos
    erp -->|"Alertas e comunicações"| notificacoes
```

## Limites

- A plataforma mantém isolamento lógico por `tenant_id`, empresa e filial.
- O provedor fiscal é acessado somente pelo adaptador `FiscalProvider`.
- A SEFAZ não é integrada diretamente no MVP.
- O cliente contrata e configura suas credenciais fiscais no modelo inicial.
