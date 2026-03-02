# Oken — Bounded Contexts (Common Core)

Este documento é a referência canônica de boundaries do Core.
Regra: nenhum contexto acessa banco de dados de outro contexto.

## Visão geral (8 contexts)

| Contexto | Dono (A/R) | Fonte canônica de dados | Principais agregados | Eventos (top) |
|---|---|---|---|---|
| Identity | Plataforma/Core | Identidade, organização, papéis | Organization, User, Membership, Policy | identity.user_created.v1, identity.membership_changed.v1 |
| Deals | Comercial/Deals | Proposta, negociação, aprovação | Deal, Proposal, Approval | deals.deal_created.v1, deals.deal_approved.v1 |
| Vault | Plataforma/Core | Evidências, documentos, trilha | Evidence, Document, SnapshotRef | vault.document_uploaded.v1, vault.snapshot_anchored.v1 |
| Rails | Operações/Workflow (R) + Plataforma (A) | Roteamento, execução | ProcessRun, RoutePolicy | rails.step_started.v1, rails.step_completed.v1 |
| Finance | Finance | Liquidação, accrual, reconciliação | LedgerEntry, Settlement, Reconciliation | finance.settlement_initiated.v1, finance.settlement_reconciled.v1 |
| Accounting/Tax | Fiscal/Contábil | Classificação fiscal e integração ERP | TaxFact, AccountingEntry | tax.fact_classified.v1, accounting.entry_posted.v1 |
| Workflow/Case | Operações/Workflow | Casos, tarefas, exceções, SLA | Case, Task, Decision | workflow.case_opened.v1, workflow.task_completed.v1 |
| Data/BI | Data/BI | Modelagem analítica e datasets | Dataset, MetricDefinition | data.dataset_published.v1 |

---

## 1) Identity

### Escopo
- autenticação/autorização
- vínculo usuário–organização–papéis
- políticas (RBAC/ABAC) e claims

### Agregados & invariantes
- Organization: id imutável; status controla capacidade de operar
- Membership: todo usuário ativo deve ter ao menos uma membership válida
- Policy: mudanças versionadas (policy_version)

### Comandos (exemplos)
- CreateOrganization
- AddMember
- GrantRole
- RotateSecrets

### Eventos (Published Language)
- identity.user_created.v1
- identity.organization_created.v1
- identity.membership_changed.v1
- identity.policy_updated.v1

### Contratos
- API: /v1/identity/...
- Eventos: ver `docs/events/catalog.md`

---

## 2) Deals
### Escopo
- proposta, negociação, aceite, aprovações e lifecycle comercial

### Agregados & invariantes
- Deal: estado monotônico (ex.: Draft -> Submitted -> Approved -> Executing -> Closed/Cancelled)
- Approval: regras de aprovação são auditáveis e reexecutáveis
- Deal não pode ir para Approved sem requisitos mínimos de risco/qualidade (via Workflow/Case ou regras internas)

### Eventos
- deals.deal_created.v1
- deals.deal_submitted.v1
- deals.deal_approved.v1
- deals.deal_cancelled.v1

---

## 3) Vault
### Escopo
- evidências, documentos, snapshots, trilha de auditoria

### Invariantes
- documento é imutável por versão; retificação gera nova versão
- todo artefato crítico tem hash e metadados de origem
- retenção e acesso seguem LGPD + policy do Identity

### Eventos
- vault.document_uploaded.v1
- vault.document_versioned.v1
- vault.snapshot_created.v1
- vault.integrity_anchor_written.v1

---

## 4) Rails
### Escopo
- roteamento operacional, execução de etapas e coordenação por eventos

### Observação
Rails não “decide semântica”; ele executa políticas operacionais definidas e auditáveis.

---

## 5) Finance
### Escopo
- cálculo financeiro, accrual, liquidação e reconciliação

### Invariantes
- lançamentos são append-only (subledger interno)
- settlement tem idempotência e rastreabilidade por Deal/ProcessRun

---

## 6) Accounting/Tax
### Escopo
- classificação contábil/fiscal e integração com ERP/fiscal

### Invariantes
- todo fato fiscal refere-se a um fato financeiro (finance_fact_ref)

---

## 7) Workflow/Case
### Escopo
- exceções, tarefas manuais, SLAs, decisões

### Invariantes
- toda decisão humana é registrada com quem/quando/porquê (audit trail)

---

## 8) Data/BI
### Escopo
- consumo analítico, datasets e KPIs

### Invariantes
- datasets sempre derivados de eventos/snapshots; nunca são “fonte de verdade”
