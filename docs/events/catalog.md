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

Funções internas com leitura autorizada no catálogo:
- monitoramento de carteira
- relatórios
- compliance/auditoria
- notificações
- painéis de backoffice

---

## campaign.published.v1
- Schema: `docs/schemas/events/campaign.published.v1.schema.json`
- Produtor oficial: Campaign Service
- Consumidores autorizados: Operation Orchestrator, Data/BI, Notification Service, monitoramento de carteira, relatórios, compliance/auditoria, painéis de backoffice
- Retry/DLQ: 5 tentativas com backoff exponencial (30s, 2m, 10m, 30m, 2h); DLQ `campaign-published-dlq`

---

## operation.step_completed.v1
- Schema: `docs/schemas/events/operation.step_completed.v1.schema.json`
- Produtor oficial: Operation Orchestrator
- Consumidores autorizados: Settlement Service, Formalization Service, Data/BI, notificações, monitoramento de carteira, painéis de backoffice
- Retry/DLQ: 8 tentativas com backoff exponencial + jitter (15s a 1h); DLQ `operation-step-completed-dlq`

---

## operation.snapshot_created.v1
- Schema: `docs/schemas/events/operation.snapshot_created.v1.schema.json`
- Produtor oficial: Operation Orchestrator
- Consumidores autorizados: Vault Snapshot Service, Data/BI, compliance/auditoria, relatórios, painéis de backoffice
- Retry/DLQ: 6 tentativas com backoff linear (1m); DLQ `operation-snapshot-created-dlq`

---

## formalization.gate_changed.v1
- Schema: `docs/schemas/events/formalization.gate_changed.v1.schema.json`
- Produtor oficial: Formalization Workflow Service
- Consumidores autorizados: Operation Orchestrator, Settlement Service, Compliance Service, notificações, compliance/auditoria, painéis de backoffice
- Retry/DLQ: 6 tentativas com backoff exponencial (20s a 30m); DLQ `formalization-gate-changed-dlq`

---

## settlement.completed.v1
- Schema: `docs/schemas/events/settlement.completed.v1.schema.json`
- Produtor oficial: Settlement Service
- Consumidores autorizados: Reconciliation Service, Accounting/Tax, Data/BI, monitoramento de carteira, relatórios, compliance/auditoria
- Retry/DLQ: 10 tentativas com política progressiva (10s a 4h); DLQ `settlement-completed-dlq`

---

## reconciliation.divergence_opened.v1
- Schema: `docs/schemas/events/reconciliation.divergence_opened.v1.schema.json`
- Produtor oficial: Reconciliation Service
- Consumidores autorizados: Case Management, Compliance Service, Notification Service, monitoramento de carteira, compliance/auditoria, painéis de backoffice
- Retry/DLQ: 7 tentativas com backoff exponencial (30s a 2h); DLQ `reconciliation-divergence-opened-dlq`

---

## portal.critical_action_logged.v1
- Schema: `docs/schemas/events/portal.critical_action_logged.v1.schema.json`
- Produtor oficial: Portal Backend
- Consumidores autorizados: Security/Identity, Compliance Service, Data/BI, compliance/auditoria, relatórios, painéis de backoffice
- Retry/DLQ: 4 tentativas com backoff curto (5s, 30s, 2m, 10m); DLQ `portal-critical-action-logged-dlq`

---

## deals.deal_approved.v1

- Schema: `docs/schemas/events/deals.deal_approved.v1.schema.json`
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

---

## finance.settlement_initiated.v1
- Schema: `docs/schemas/events/finance.settlement_initiated.v1.schema.json`
- Produtor: Finance
- Consumidores: Adapters (payments/banks), Data/BI
- Dedupe key: `settlement_id`

---

## vault.document_uploaded.v1
- Produtor: Vault
- Consumidores: Workflow/Case (se exigir validação humana), Data/BI
- Dedupe key: `document_id:version`
