# Catálogo de Eventos

| Evento | Produtor | Consumidores | Versão | Deduplicação | Retry/DLQ |
| --- | --- | --- | --- | --- | --- |
| `deal.approved.v1` | Deals | Finance, Rails, Data/BI | v1 | `event_id` | retry exponencial + DLQ `deals.approved.dlq` |
| `finance.settlement.completed.v1` | Finance | Accounting/Tax, Workflow/Case, Data/BI | v1 | `event_id` | retry linear + DLQ `finance.settlement.dlq` |
| `vault.snapshot.created.v1` | Vault | Data/BI, Compliance | v1 | `snapshot_id` | retry exponencial + DLQ `vault.snapshot.dlq` |

## Metadados obrigatórios

- `event_id` único global;
- `occurred_at` em UTC;
- `schema_version` e `producer_context`.
