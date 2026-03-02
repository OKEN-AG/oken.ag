# Oken — Event Catalog (Published Language)

Padrão de nome:
`<context>.<event_name>.v<version>`

Padrão de envelope:
- event_id (uuid)
- occurred_at (RFC3339)
- producer (service/context)
- schema_version (string, ex: "v1")
- dedupe_key (string, obrigatório quando consumidor precisa idempotência por entidade)
- payload (objeto)

Entrega: at-least-once. Consumidores: deduplicação obrigatória.

---

## deals.deal_approved.v1

- Produtor: Deals
- Consumidores: Finance, Rails, Vault (snapshot), Data/BI
- Dedupe key: `deal_id:status_transition_id`
- DLQ: sim (finance-settlement-dlq)

Payload mínimo:
- deal_id
- approval_id
- approved_by
- approved_at
- deal_snapshot_ref (opcional)

Schema: `docs/schemas/events/deals.deal_approved.v1.schema.json`

---

## finance.settlement_initiated.v1
- Produtor: Finance
- Consumidores: Adapters (payments/banks), Data/BI
- Dedupe key: `settlement_id`

---

## vault.document_uploaded.v1
- Produtor: Vault
- Consumidores: Workflow/Case (se exigir validação humana), Data/BI
- Dedupe key: `document_id:version`
