# SLOs Arquiteturais

## APIs síncronas

- Disponibilidade mensal >= 99.9%.
- p95 de latência <= 800ms em operações críticas.
- Taxa de erro 5xx <= 0.5%.

## Eventos assíncronos

- Latência de consumo p95 <= 60s.
- Taxa de falha após retries <= 0.3%.
- Backlog de DLQ <= limiar definido por domínio.

## Snapshots

- Completude de geração >= 99.5% por janela.
- Integridade validada por checksum em 100% dos artefatos críticos.
- Rastreabilidade de origem (`context`, `aggregate`, `as_of`) obrigatória.
