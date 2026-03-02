# Runbook — Retry manual assistido e tratamento de exigências (Registry)

## Objetivo

Executar reprocessamento manual seguro da fila dedicada de registro (`registry_event_outbox`) e padronizar o tratamento operacional de exigências retornadas por cartório/provedor.

## Pré-requisitos

1. Validar que endpoint/credencial/schema do destino foi corrigido.
2. Confirmar janela de intervenção com Operações + Produto.
3. Utilizar perfil com permissão administrativa (RLS de `admin`).

## 1) Triagem de falhas por destino (DLQ dedicada)

```sql
select
  dlq.id,
  dlq.outbox_id,
  dlq.registry_request_id,
  dlq.destination,
  dlq.failed_at,
  dlq.last_error,
  dlq.error_payload,
  dlq.payload
from public.registry_event_outbox_dlq dlq
where dlq.reprocessed_at is null
order by dlq.destination, dlq.failed_at asc
limit 200;
```

### Critérios de priorização

- **P1**: destinos com maior volume de `failed_at` na última hora.
- **P2**: erros funcionais recorrentes (`4xx` por payload inválido).
- **P3**: erros transitórios (`timeout`, `5xx`).

## 2) Retry manual assistido (lote controlado)

> Reprocessar lotes pequenos por destino para reduzir blast radius.

```sql
begin;

with selected as (
  select dlq.outbox_id
  from public.registry_event_outbox_dlq dlq
  where dlq.reprocessed_at is null
    and dlq.destination = 'https://registry-provider.example.com/request'
  order by dlq.failed_at asc
  limit 50
)
update public.registry_event_outbox reo
set
  status = 'pending',
  attempts = 0,
  next_retry_at = null,
  last_error = null,
  updated_at = now()
from selected
where reo.id = selected.outbox_id
  and reo.status = 'dead_lettered';

update public.registry_event_outbox_dlq dlq
set reprocessed_at = now()
where dlq.outbox_id in (select outbox_id from selected)
  and dlq.reprocessed_at is null;

commit;
```

## 3) Tratamento de exigências (requirement_flag)

Quando status externo mapeado resultar em `canonical_status = 'reprovado'` e `requirement_flag = true`:

1. Registrar motivo em `registry_reconciliation.details` com categoria de exigência.
2. Notificar time operacional com `request_id`, `operation_id`, prazo e evidências.
3. Atualizar documentação/garantias da operação e reenviar via `registry-request` com nova `idempotencyKey`.
4. Acompanhar retorno por `registry-callback` ou `registry-status-sync`.

### Consulta de exigências pendentes

```sql
select
  rr.id as request_id,
  rr.operation_id,
  rr.provider,
  rr.external_status,
  rr.canonical_status,
  rr.requirement_flag,
  rr.responded_at,
  rr.updated_at
from public.registry_requests rr
where rr.requirement_flag is true
order by rr.updated_at desc
limit 100;
```

## 4) Critérios de encerramento

- Fila `registry_event_outbox` sem acúmulo anormal de `failed/dead_lettered`.
- Exigências classificadas e encaminhadas com responsável + SLA.
- Reconciliação sem divergência crítica nas últimas execuções.

## Evidências mínimas

- IDs/lote reprocessado e destino.
- Timestamp início/fim do replay.
- Taxa de sucesso pós-retry por destino.
- Lista de exigências abertas, tratadas e pendentes.
