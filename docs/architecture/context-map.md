# Context Map do Common Core

| Upstream | Downstream | Relação DDD | Contrato publicado | Risco principal |
| --- | --- | --- | --- | --- |
| Identity | Deals | Published Language | API `identity/v1/claims` | drift de autorização |
| Deals | Finance | ACL | Evento `deal.approved.v1` | quebra de semântica de aprovação |
| Finance | Accounting/Tax | Conformist | Evento `finance.entry.posted.v1` | atraso na classificação fiscal |
| Deals | Vault | Published Language | Snapshot `deal.snapshot.v1` | perda de evidência temporal |
| Rails | Workflow/Case | ACL | Evento `rails.execution.failed.v1` | retry sem deduplicação |
| Core (multi) | Data/BI | Published Language | Snapshots versionados por domínio | inconsistência histórica |

## Diretrizes

- Todo contrato deve informar owner, versão e estratégia de depreciação.
- Contextos downstream implementam anti-corruption layer quando consumirem parceiros externos.
