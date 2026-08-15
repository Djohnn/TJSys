# Data Classification

| Classe | Exemplos | Controles mínimos |
|---|---|---|
| Public | documentação pública, status genérico | integridade e revisão |
| Internal | métricas agregadas, runbooks | autenticação e logging |
| Confidential | clientes, vendas, estoque | tenant scope, criptografia e retenção |
| Restricted | certificados, tokens fiscais, credenciais, dados financeiros e documentos fiscais | criptografia de campo, acesso mínimo, auditoria e proibição em logs |

Exportação preserva classificação. Cópias de produção não são usadas em desenvolvimento sem anonimização aprovada.

## Financeiro, fiscal e IA

| Campo ou artefato | Classe | Uso por IA |
|---|---|---|
| Totais agregados de vendas/estoque | Confidential | permitido em read model tenant-scoped |
| Valor, vencimento, liquidação e fluxo de caixa | Restricted | somente agregado e autorizado |
| CPF/CNPJ, destinatário e endereço fiscal | Restricted | proibido sem redaction/base legal |
| XML/PDF fiscal e payload de webhook | Restricted | proibido |
| Token, certificado, chave e segredo de provider | Restricted | sempre proibido |

Copilotos futuros permanecem somente leitura. Escritas financeiras, fiscais, comerciais ou de
estoque exigem aprovação humana e workflow transacional fora do contexto do modelo.

## Pessoas e LGPD

| Dado | Classe | Controle |
|---|---|---|
| Nome, nome empresarial e papéis | Confidential | tenant scope e acesso autenticado |
| CPF/CNPJ, e-mail, telefone e endereço | Restricted | normalização, retenção, auditoria e proibição em logs/eventos |
| Consentimento e revogação | Restricted | histórico imutável, finalidade explícita e tenant scope |

Eventos de pessoas carregam somente identificadores técnicos e papéis. Documentos, contatos e
endereços não podem aparecer em logs, detalhes de auditoria ou payloads de Outbox.

### Detalhamento dos modelos People (Sprint 12)

| Modelo / Campo | Classe | Notas |
|---|---|---|
| `Person.name` / `trade_name` | Confidential | Identificação básica, tenant-scoped |
| `Person.person_type` (PF/PJ) | Confidential | Classificação do sujeito |
| `PersonRole.role` | Confidential | Papel operacional (customer, supplier, carrier, contact) |
| `PersonDocument.value` (CPF/CNPJ) | Restricted | Normalizado, único ativo por tenant, LGPD Art. 5º |
| `PersonDocument.document_type` | Restricted | Tipo do documento (CPF/CNPJ) |
| `PersonAddress` (street, number, district, city, state, postal_code, country) | Restricted | Endereço completo, normalizado via CEP |
| `PersonContact.value` (e-mail, telefone) | Restricted | Normalizado, marcado como primário quando aplicável |
| `ConsentRecord.purpose` / `granted` / `revoked_at` | Restricted | Base legal LGPD Art. 7º, histórico imutável |
| `ConsentRecord.source` | Restricted | Origem do consentimento (web, PDV, API, importação) |

Integrações:
- `Sale.customer` → `Person` (role=customer): apenas `person_id` e `role` em eventos/Outbox
- `Supplier.person` → `Person` (role=supplier): vínculo 1:1, dados fiscais via `PersonDocument` + `PersonAddress`
- Fiscal recipient: montado a partir de `PersonDocument` + `PersonAddress` (primary), nunca logado
