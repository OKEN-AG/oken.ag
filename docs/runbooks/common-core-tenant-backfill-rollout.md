# Runbook: backfill de `tenant_id` (Common Core canônico)

## Escopo
Aplica-se às tabelas canônicas:

- `public.parties`
- `public.organizations`
- `public.programs`
- `public.deals`
- `public.evidences`
- `public.core_snapshots`
- `public.business_events`

Migration de referência: `supabase/migrations/20260303110000_common_core_tenant_backfill_incremental.sql`.

## Estratégia de rollout incremental

1. **Executar migration em ambiente de staging** e validar que não há exceções de nulos/inconsistências.
2. **Executar teste de isolamento** `supabase/tests/common_core_tenant_isolation.sql`.
3. **Promover para produção em janela controlada**, monitorando logs de erro SQL.
4. Confirmar que `tenant_id` está com `NOT NULL` nas 7 tabelas.

## Pré-checks (antes de rodar em produção)

```sql
SELECT 'parties' AS table_name, COUNT(*) AS null_tenant FROM public.parties WHERE tenant_id IS NULL
UNION ALL
SELECT 'organizations', COUNT(*) FROM public.organizations WHERE tenant_id IS NULL
UNION ALL
SELECT 'programs', COUNT(*) FROM public.programs WHERE tenant_id IS NULL
UNION ALL
SELECT 'deals', COUNT(*) FROM public.deals WHERE tenant_id IS NULL
UNION ALL
SELECT 'evidences', COUNT(*) FROM public.evidences WHERE tenant_id IS NULL
UNION ALL
SELECT 'core_snapshots', COUNT(*) FROM public.core_snapshots WHERE tenant_id IS NULL
UNION ALL
SELECT 'business_events', COUNT(*) FROM public.business_events WHERE tenant_id IS NULL;
```

## Rollback operacional

> Observação: migration DDL em Postgres é transacional por statement/migration, porém `SET NOT NULL` pode já ter sido aplicado antes de uma tentativa de correção manual posterior. Este rollback é **operacional** para restaurar capacidade de saneamento.

1. Reabrir coluna para ajuste manual (somente se necessário):

```sql
ALTER TABLE public.parties ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.organizations ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.programs ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.deals ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.evidences ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.core_snapshots ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.business_events ALTER COLUMN tenant_id DROP NOT NULL;
```

2. Corrigir registros órfãos/inconsistentes com queries de saneamento controladas.
3. Reexecutar a migration incremental.

## Reexecução segura (idempotência)

A migration foi escrita para reexecução segura:

- `UPDATE ... WHERE tenant_id IS NULL` evita sobrescrever tenant já saneado.
- `ensure_tenant_not_null(...)` só aplica `SET NOT NULL` quando a coluna ainda está anulável.
- validações explícitas interrompem a execução ao detectar dados inválidos.

### Procedimento recomendado de retry

1. Rodar pré-check de nulos.
2. Corrigir fontes de inconsistência apontadas pela exceção da migration.
3. Reexecutar migration.
4. Executar teste de isolamento entre tenants.

## Validação pós-deploy

```sql
SELECT table_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'tenant_id'
  AND table_name IN (
    'parties', 'organizations', 'programs', 'deals',
    'evidences', 'core_snapshots', 'business_events'
  )
ORDER BY table_name;
```

Resultado esperado: `is_nullable = 'NO'` para todas as tabelas acima.
