# Padrão de Wrappers

Wrappers são fachadas para legados/parceiros com contrato volátil.

## Quando criar

- Alto risco de drift de contrato externo.
- Necessidade de normalização de payload heterogêneo.
- Migração incremental sem bloquear roadmap.

## Governança

- Todo wrapper precisa de owner, SLA e plano de sunset.
- Wrapper não centraliza regra crítica de negócio.
