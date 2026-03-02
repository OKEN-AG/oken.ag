# Runbook — Reprocessamento manual idempotente da DLQ

## Objetivo

Reprocessar eventos em `dead_lettered` de forma segura, auditável e idempotente.

## Pré-requisitos

1. Confirmar que a causa raiz foi corrigida (endpoint destino, credencial, schema etc.).
2. Definir janela de manutenção ou comunicação para o time de produto.
3. Usar credenciais com papel administrativo.

## Passos

### 1) Selecionar lote elegível

```sql
select
  dlq.id,
  dlq.outbox_id,
  dlq.business_event_id,
  dlq.destination,
  dlq.failed_at,
  dlq.error_payload
from public.event_outbox_dlq dlq
where dlq.reprocessed_at is null
order by dlq.failed_at asc
limit 100;
```

### 2) Validar idempotência do destino

- Confirmar uso de `idempotency_key` no consumidor.
- Se necessário, registrar chaves já aplicadas no destino antes do replay.

### 3) Reenfileirar de forma idempotente

```sql
begin;

update public.event_outbox eo
set
  status = 'pending',
  attempts = 0,
  next_retry_at = null,
  last_error = null,
  updated_at = now()
where eo.id in (
  select dlq.outbox_id
  from public.event_outbox_dlq dlq
  where dlq.reprocessed_at is null
  order by dlq.failed_at asc
  limit 100
)
and eo.status = 'dead_lettered';

update public.event_outbox_dlq dlq
set reprocessed_at = now()
where dlq.outbox_id in (
  select eo.id
  from public.event_outbox eo
  where eo.status = 'pending'
)
and dlq.reprocessed_at is null;

commit;
```

### 4) Acompanhar pós-replay

- Monitorar `pending_count`, `retry_rate`, `latency_p95_ms` na dashboard.
- Confirmar queda de `dead_letter_rate` e ausência de duplicidade funcional no consumidor.

## Rollback

Se erro regressar:

1. Pausar agenda do worker.
2. Voltar registros recém-reprocessados para `dead_lettered`.
3. Abrir incidente e anexar `error_payload/error_stack` da DLQ.

## Evidências mínimas

- Intervalo de IDs reprocessados.
- Timestamp de início/fim.
- Métricas antes/depois.
- Validação de idempotência no sistema consumidor.
