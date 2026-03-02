# Bounded Contexts do Common Core

## Catálogo

| Contexto | Escopo | Agregados centrais | Invariantes-chave |
| --- | --- | --- | --- |
| Identity | IAM, vínculos e perfis | User, OrganizationMembership, CredentialPolicy | identidade única por tenant; claims emitidos com política ativa |
| Deals | Propostas e lifecycle comercial | Deal, Proposal, ApprovalDecision | transições de estado válidas; aceite imutável após assinatura |
| Vault | Evidências, documentos e trilha | EvidenceRecord, DocumentSnapshot, RetentionPolicy | evidência versionada; trilha auditável e retenção aplicável |
| Rails | Orquestração operacional | ExecutionRoute, RoutingRule, ExecutionAttempt | roteamento determinístico por versão de regra |
| Finance | Cálculo, liquidação e reconciliação | FinancialEntry, SettlementBatch, ReconciliationCase | lançamento balanceado; status de liquidação consistente |
| Accounting/Tax | Classificação fiscal/contábil | FiscalEvent, LedgerPosting, TaxObligation | classificação obrigatória antes de fechamento |
| Workflow/Case | Casos, tarefas e exceções | Case, Task, SLAClock | SLA rastreável; decisão com responsável atribuído |
| Data/BI | Curadoria analítica e KPIs | AnalyticalDataset, KPIView, SnapshotLineage | rastreabilidade de origem; atualização conforme janelas de carga |

## Regras de boundary

- Comunicação entre contextos somente por API, evento ou snapshot versionado.
- Acesso direto a banco de dados de outro contexto é proibido.
- Mudanças semânticas exigem ADR e plano de compatibilidade.
