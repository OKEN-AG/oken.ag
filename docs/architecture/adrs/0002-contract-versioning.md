# ADR 0002 — Versionamento de contratos (API/Evento/Snapshot)

## Status
Accepted

## Contexto
Mudanças sem versionamento explícito elevam risco de quebra de consumidores downstream.

## Decisão
Todos os contratos devem ter versão explícita e estratégia de compatibilidade.
Mudança breaking requer nova versão major (ex.: v2) e plano de rollout/rollback.

## Consequências
- OpenAPI e schemas JSON são artefatos obrigatórios em mudanças de contrato.
- CI deve validar formato e naming dos contratos versionados.
