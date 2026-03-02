

# Plano: Correção dos 15 Erros de Build

## Diagnóstico

Existem 4 categorias de erro distintas:

### 1. Imports quebrados nos testes (credit.test.ts, freight.test.ts)
Os arquivos de teste importam de `./credit` e `./freight` sem extensão `.ts`. No Deno, extensões são obrigatórias.

**Fix:** Adicionar `.ts` aos imports nos dois arquivos de teste.

### 2. Tipos implícitos `any` (credit.test.ts)
O `reduce`, `every`, `map`, `find` nos testes usam callbacks sem tipagem — 7 erros de `TS7006`.

**Fix:** Tipar os parâmetros dos callbacks como `CreditInstallment` e `PaymentMethodCostResult` importando os tipos de `./credit.ts`.

### 3. Funções não definidas/importadas (simulation-engine/index.ts)
- `calculateFreightBreakdown` — existe em `../server/engines/freight.ts` mas nunca é importada.
- `persistDecisionSnapshot` — é chamada mas **não existe em nenhum lugar do projeto**. Precisa ser criada ou o bloco que a usa precisa ser removido/stub.

**Fix:**
- Adicionar import de `calculateFreightBreakdown` de `../server/engines/freight.ts`.
- Criar uma função inline `persistDecisionSnapshot` no simulation-engine (insere na tabela `operation_snapshots` ou similar), ou transformar o bloco em no-op comentado até a implementação completa.
- Cast `EligibilityResult` para `Record<string, unknown>` na linha 936: `result = checkEligibility(...) as unknown as Record<string, unknown>`.

### 4. Tipo SupabaseClient incompatível (calculate-engine/index.ts)
`resolveCreditComposition` recebe `ReturnType<typeof createClient>` mas o `supabase` local é tipado como `SupabaseClient<any, "public", any>` que não é assignable.

**Fix:** Mudar o parâmetro de `resolveCreditComposition` para `supabase: any` ou usar um tipo mais permissivo.

---

## Arquivos a modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/server/engines/credit.test.ts` | Fix import `./credit` → `./credit.ts` + tipar callbacks |
| `supabase/functions/server/engines/freight.test.ts` | Fix import `./freight` → `./freight.ts` |
| `supabase/functions/simulation-engine/index.ts` | Import `calculateFreightBreakdown`, criar stub `persistDecisionSnapshot`, cast `EligibilityResult` |
| `supabase/functions/calculate-engine/index.ts` | Relaxar tipo do parâmetro `supabase` em `resolveCreditComposition` |

## Impacto
- Zero mudança funcional — apenas correções de tipagem e imports
- Todos os 15 erros de build resolvidos

