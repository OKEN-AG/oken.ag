# Runbook — Falhas de Integração entre Camadas

## Diagnóstico inicial

1. Identificar contrato impactado (API, evento ou snapshot).
2. Confirmar erro por correlação (`request_id`/`event_id`).
3. Avaliar escopo por tenant e domínio afetado.

## Resposta operacional

- Ativar fallback previsto no adapter/wrapper.
- Reduzir blast radius com feature flag/roteamento parcial.
- Registrar incidente com owner R/A.

## Reprocessamento

- API: replay idempotente por `Idempotency-Key`.
- Evento: replay da DLQ com deduplicação por `event_id`.
- Snapshot: regeneração por `as_of` e checksum.

## Encerramento

- Pós-mortem com causa raiz e ação preventiva.
- Atualizar alertas, SLO e documentação contratual.
