# ADR 0003 — Blockchain somente como Adapter opcional

## Status
Accepted

## Contexto
Blockchain pode agregar valor de integridade/liquidação, mas não deve comprometer invariantes do Core.

## Decisão
Blockchain é permitida apenas como Adapter opcional para subledger, anchor de integridade e rail alternativo.
O Core não depende de disponibilidade blockchain para operar.

## Consequências
- Falha blockchain não pode interromper o fluxo transacional crítico do Core.
- Integração blockchain deve ter fallback e reconciliação explícitos.
