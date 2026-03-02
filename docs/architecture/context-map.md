# Oken — Context Map (Common Core)

Regra: relacionamento entre contexts é explicitado por tipo de integração e contrato.
Legenda: U/D = Upstream/Downstream; Rel = Relationship.

## Mapa (alto nível)

| Upstream | Downstream | Rel | Contrato principal | Observações |
|---|---|---|---|---|
| Identity | Todos | Published Language | eventos identity.* + API /identity | Todos consomem claims/policies, sem dependência de DB |
| Deals | Finance | Published Language | deals.deal_approved.v1 | Finance inicia settlement a partir de deal aprovado |
| Deals | Vault | ACL | comando “CreateDealSnapshot” (via Rails) | Vault só armazena evidência; sem regra de Deal |
| Finance | Accounting/Tax | Published Language | finance.* facts -> tax/accounting | Accounting/Tax deriva classificação |
| Rails | Workflow/Case | Conformist | workflow.* / rails.* | Workflow orquestra exceções; Rails executa steps |
| Vault | Data/BI | Published Language | snapshots + eventos vault.* | Data consome para analytics e auditoria |
| Finance | Data/BI | Published Language | snapshots finance.* | Data consolida KPIs e histórico |

## Anti-corruption layers (ACLs) obrigatórios
- Interfaces -> Core: validações de borda + normalização de linguagem
- Adapters/Wrappers -> Core: tradução de protocolos externos para contratos internos
- Deals -> Vault: Vault não entende “Deal”; apenas snapshot/evidência padronizada

## Contratos de referência
- APIs: `docs/api/openapi-core.yaml`
- Eventos: `docs/events/catalog.md`
- Schemas: `docs/schemas/events/*` e `docs/schemas/snapshots/*`
