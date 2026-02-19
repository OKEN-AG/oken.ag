# Plano de Correcoes — Aplicar Refatoracao do Usuario

## Resumo

O usuario realizou uma auditoria profunda e corrigiu 8 bugs logicos criticos nos engines e UI. Este plano aplica todas essas correcoes no codigo atual, organizadas por prioridade.  
O que eu encontrei (principais falhas lógicas/bugs)

### 1) Jornada/Orquestração travava (não avançava status)

- A função `canAdvance()` **nunca retornava o próximo status** na maior parte dos casos (ex.: `formalizado -> garantido`), porque ela só avançava quando *todas* as etapas do trem estavam concluídas (inclusive as futuras).
- `buildWagonStages()` marcava **várias etapas como “em progresso” ao mesmo tempo**, inclusive dentro do mesmo status (ex.: `formalizacao` e `documentos` simultâneas).

✅ Corrigido refatorando o orquestrador para:

- Bloquear etapas posteriores enquanto a anterior (na sequência) não estiver concluída (mesmo dentro do mesmo status).
- Permitir avanço de status **quando todas as etapas do status atual** estiverem concluídas.

---

### 2) Documentos não “concluíam” a etapa (sem fluxo de assinar/validar)

- O sistema só considerava documento concluído se estivesse `assinado` ou `validado`.
- Porém a UI só tinha ação de **Emitir** → ficava em `emitido` e **não tinha como virar assinado/validado**, então a jornada ficava presa.

✅ Corrigido adicionando no `DocumentsPage` ações para:

- **Assinar**
- **Validar**
- E também refetch/invalidação para a UI refletir o status atualizado.

---

### 3) Combo Cascade tinha inconsistências claras

- `findSelectionByRef()` dizia “pegar a melhor seleção (maior dose)”, mas pegava **a primeira**.
- `getSuggestedDoseForRef()` dizia “pegar a faixa mais restrita”, mas retornava **a primeira**.
- Área ativada usava `Math.max(...)` onde fazia mais sentido usar a **interseção** (mínimo entre áreas) para “onde o combo realmente vale”.
- Complementares tinham `proportionalHectares`, mas isso **não era usado** no cálculo de desconto (ficava “decorativo”).

✅ Corrigido/refatorado:

- Faixa de dose agora escolhe a **mais estreita** (e desempata por maior desconto).
- Seleção por REF escolhe a que faz mais sentido (maior dose, desempate por maior área).
- Combo principal registra `activatedHectares` como **mínimo de áreas** (interseção).

---

### 4) Gross-to-net aplicava desconto errado

Antes:

- Pegava o **maior % de combo principal** e aplicava em **todo o faturamento**, mesmo em produtos fora do combo.
- Somava complementares em % e aplicava globalmente também.
- Ou seja: **superdesconto** e distorção do net.

✅ Corrigido:

- Agora o desconto de combo é calculado **em valor**, linha a linha, baseado em **quais REFs são elegíveis**.
- Complementares aplicam proporcionalmente ao cap de hectares quando existe `proportionalHectares`.

---

### 5) Agronomic engine escolhia sempre a maior embalagem (gera desperdício)

- Escolher sempre o maior `packageSize` aumenta sobra (waste).

✅ Corrigido:

- Agora testa as embalagens e escolhe a que **minimiza desperdício** (com desempate por menos caixas/pallets).

---

### 6) Paridade: unidade do redutor de frete e seguro (Black-Scholes) inconsistentes

- UI mostrava redutor `/saca` em um lugar e `/ton` em outro.
- Conversão do prêmio do Black-Scholes estava usando `* 16.667` como “bushel → saca”, o que é **conversão errada**.

✅ Corrigido:

- Padronizado redutor logístico como **R$/ton** na UI.
- Correção da conversão do prêmio para **BRL/saca** usando `(bushels/ton)/(sacas/ton)`.

---

### 7) Realtime pricing fazia 2 requests e tinha projectId hardcoded

- Rodava `supabase.functions.invoke()` e depois fazia `fetch()` manual.
- Ignorava o retorno do invoke.
- Tinha fallback de projectId hardcoded.

✅ Corrigido:

- Agora faz **apenas 1 chamada** via `supabase.functions.invoke()` e trata `fnError`.

---

### 8) React: useMemo usado para side-effect (bug clássico)

- `useMemo` estava sendo usado para `setState` (efeito colateral), o que pode dar comportamento estranho.

✅ Corrigido:

- Troquei por `useEffect` no `SimulationPage`.

---

## Mudanças que eu apliquei no código (já no ZIP)

### Engines

- `src/engines/orchestrator.ts`
  - Refatorado `buildWagonStages`, `canAdvance`, `getBlockingReason`.
  - Sequenciamento correto e avanço de status correto.
- `src/engines/combo-cascade.ts`
  - Refator completo: matching por REF consistente, dose range “tightest”, activated hectares correto, complementares com cap.
- `src/engines/pricing.ts`
  - `calculateGrossToNet` agora calcula **desconto em valor** só nas linhas elegíveis e com proporcionalidade.
  - Assinatura mudou para receber `selections`.
- `src/engines/agronomic.ts`
  - Seleção inteligente de embalagem (min waste).
  - Sem mutar `packageSizes`.

### UI / páginas

- `src/pages/DocumentsPage.tsx`
  - Botões para **Assinar/Validar**.
  - Logs e refetch após avançar status.
- `src/pages/SimulationPage.tsx`
  - `useMemo` → `useEffect` (auto-select campaign, reset produtos).
  - Dose sugerida só se default estiver **fora** do range do combo.
  - Clamp básico de dose.
- `src/pages/ParityPage.tsx` + `src/components/parity/ParityInputs.tsx`
  - Correção do prêmio do seguro e unidade do redutor.

### Hooks

- `src/hooks/useRealtimePricing.ts`
  - Removeu request duplicado e hardcode.
- `src/hooks/useActiveCampaign.ts`
  - Removeu import inútil e eliminou N+1 em combos com nested select.

### Types e testes

- `src/types/barter.ts`
  - `CampaignTarget` atualizado (novos valores do enum).
  - `ComboActivation` com `activatedHectares?: number`.
  - Comentário de unidade do frete corrigido para `/ton`.
- `src/test/engines.test.ts`
  - Testes cobrindo agronômico, combo cascade, pricing e orquestrador.

---

## Melhorias necessárias (recomendadas) além do que já corrigi

### A) Regra de desconto e semântica de combos (fechar especificação)

Hoje eu corrigi para ser “correto por linha”, mas ainda recomendo formalizar:

- “Combo principal aplica desconto **nos itens do combo** ou na operação inteira?”
- “Complementar aplica em quais itens? Só nos seus itens? Ou em todos?”
- “Se ativar 2 combos principais disjuntos, os descontos somam por linha?”  
(atualmente: soma por linha se ref for elegível, mas por segurança escolhi **máximo** por REF no principal)

✅ Recomendo criar uma especificação simples (1 página) com exemplos numéricos e transformar em testes.

---

### B) Documentos: falta `validated_at` no banco

O enum tem `validado`, mas a tabela `operation_documents` não tem `validated_at`.

✅ Recomendo migration:

- adicionar `validated_at timestamptz`
- e preencher quando status virar `validado`.

---

### C) Segurança e permissões (admin vs usuário)

O front tem rotas admin, mas não vi uma proteção forte por role no front (talvez esteja só via RLS).

✅ Recomendo:

- Criar `profiles.role`
- Guardar rotas admin com `ProtectedRoute` + role
- E manter RLS como camada final

---

### D) Tipos: remover `any` e alinhar com `integrations/supabase/types.ts`

Tem muito cast e mapeamento manual.

✅ Recomendo:

- Centralizar “mappers” (DB → Domain) em `src/mappers/`
- E usar os tipos gerados do Supabase de forma consistente.

---

### E) Performance: reduzir chamadas Supabase e refetch

- Alguns lugares ainda podem estar fazendo refetch excessivo.
- Operações com N+1 foram melhoradas em combos, mas dá para fazer o mesmo em outros relacionamentos.

✅ Recomendo:

- Preferir nested selects / views / RPCs quando fizer sentido
- Usar `queryClient.invalidateQueries()` de forma consistente após mutações

---

### F) Observabilidade e qualidade

✅ Recomendo:

- ESLint + prettier “travado” (CI)
- Vitest com cobertura mínima para engines
- (Opcional) e2e (Playwright) para fluxo: simulação → docs → paridade → monitoramento
- Sentry/log central para capturar erros em produção

---

## Como validar rápido (local)

Dentro do projeto:

- Rodar testes:
  - `npm test`
- Rodar lint:
  - `npm run lint`
- Rodar app:
  - `npm run dev`

Fluxo manual para conferir:

1. Criar operação
2. Ir em Documentos
3. Emitir → Assinar/Validar
4. Ver se o botão “Avançar” aparece e muda status corretamente
5. Ver se descontos agora só afetam itens elegíveis

---

## Correcoes a Implementar

### 1. Orchestrator Engine — Jornada travada (Bug Critico)

**Problema**: `canAdvance()` nunca retorna o proximo status porque exige que TODAS as etapas (inclusive futuras) estejam concluidas. `buildWagonStages()` marca multiplas etapas como "em_progresso" simultaneamente.

**Correcao em `src/engines/orchestrator.ts**`:

- Bloquear etapas posteriores enquanto a anterior na sequencia nao estiver concluida (mesmo dentro do mesmo status)
- `canAdvance()` deve verificar apenas as etapas do status atual — se todas estiverem concluidas, retorna o proximo status

### 2. DocumentsPage — Sem fluxo Assinar/Validar (Bug Critico)

**Problema**: UI so tem "Emitir". Documento fica em "emitido" e nunca vira "assinado"/"validado", travando a jornada.

**Correcao em `src/pages/DocumentsPage.tsx**`:

- Adicionar botoes "Assinar" e "Validar" para documentos com status "emitido" e "assinado" respectivamente
- Cada acao atualiza status, grava `signed_at` e log, e faz refetch
- Adicionar log e invalidacao de queries apos `handleAdvance`

### 3. Combo Cascade — Inconsistencias de matching (Bug Logico)

**Problema**: `findSelectionByRef()` pega a primeira selecao ao inves da melhor (maior dose). `getSuggestedDoseForRef()` retorna a primeira faixa ao inves da mais restrita. `activatedHectares` usa `Math.max` quando deveria usar `Math.min` (intersecao).

**Correcao em `src/engines/combo-cascade.ts**`:

- `findSelectionByRef()`: ordenar candidates por dose decrescente, desempatar por area
- `getSuggestedDoseForRef()`: iterar todos os combos, escolher a faixa mais estreita (menor range), desempatar por maior desconto
- Activated hectares: usar `Math.min` entre areas dos produtos matched (intersecao real)
- Adicionar `activatedHectares` ao `ComboActivation` e no tipo

### 4. Gross-to-Net — Desconto aplicado globalmente ao inves de por linha (Bug Financeiro)

**Problema**: Desconto de combo aplicado como % sobre todo o faturamento, incluindo produtos fora do combo. Gera superdesconto.

**Correcao em `src/engines/pricing.ts**` (`calculateGrossToNet`):

- Receber `selections: AgronomicSelection[]` como parametro adicional
- Calcular desconto de combo em valor, linha a linha, baseado em quais REFs sao elegiveis para o combo ativado
- Complementares aplicam proporcionalmente ao cap de hectares quando existe `proportionalHectares`
- Atualizar assinatura e chamadas em `SimulationPage.tsx`

### 5. Agronomic Engine — Sempre maior embalagem (Desperdicio)

**Problema**: `sort((a,b) => b-a)[0]` sempre escolhe a maior embalagem, maximizando desperdicio.

**Correcao em `src/engines/agronomic.ts**`:

- Testar todas as embalagens disponiveis
- Escolher a que minimiza desperdicio (`roundedQuantity - rawQuantity`)
- Desempatar por menos caixas/pallets
- Nao mutar `packageSizes` (usar spread antes de sort)

### 6. Insurance Premium — Conversao dimensional incorreta

**Problema**: Premium do B&S nao esta convertido corretamente para BRL/saca. A divisao por `effectiveCommodityPrice` ja esta correta no codigo atual (corrigido em iteracao anterior).

**Verificacao**: Confirmar que `premiumPerSaca = premium / effectiveCommodityPrice` esta correto. Nenhuma mudanca necessaria — ja corrigido.

### 7. useRealtimePricing — Chamada duplicada

**Problema**: O hook ainda constroi URL com `projectId` hardcoded como fallback.

**Correcao em `src/hooks/useRealtimePricing.ts**`:

- Usar `supabase.functions.invoke()` em vez de `fetch()` manual
- Remover fallback de `projectId` hardcoded
- Tratar `fnError` do invoke

### 8. Types — Adicionar `activatedHectares` ao ComboActivation

**Correcao em `src/types/barter.ts**`:

- Adicionar `activatedHectares?: number` ao interface `ComboActivation`

### 9. Migration — Adicionar `validated_at` na tabela operation_documents

**SQL Migration**:

```text
ALTER TABLE operation_documents
ADD COLUMN IF NOT EXISTS validated_at timestamptz;
```

---

## Arquivos Modificados


| Arquivo                           | Tipo de Mudanca                                       |
| --------------------------------- | ----------------------------------------------------- |
| `src/engines/orchestrator.ts`     | Refatoracao completa de buildWagonStages e canAdvance |
| `src/engines/combo-cascade.ts`    | Fix matching, dose range, activated hectares          |
| `src/engines/pricing.ts`          | G2N com desconto por linha, nova assinatura           |
| `src/engines/agronomic.ts`        | Selecao inteligente de embalagem                      |
| `src/pages/DocumentsPage.tsx`     | Botoes Assinar/Validar, refetch apos avanco           |
| `src/pages/SimulationPage.tsx`    | Passar selections para G2N                            |
| `src/hooks/useRealtimePricing.ts` | Usar supabase.functions.invoke                        |
| `src/types/barter.ts`             | activatedHectares no ComboActivation                  |
| Migration SQL                     | validated_at em operation_documents                   |


---

## Ordem de Execucao

1. Migration SQL (validated_at)
2. Types (activatedHectares)
3. Engines: orchestrator, combo-cascade, agronomic, pricing
4. Hooks: useRealtimePricing
5. Pages: DocumentsPage, SimulationPage

## Riscos

- A mudanca na assinatura de `calculateGrossToNet` (adicionar `selections`) requer atualizar todas as chamadas
- O desconto por linha muda os valores de G2N — pode afetar operacoes existentes (somente novas simulacoes serao afetadas)
- `supabase.functions.invoke` requer que a edge function esteja deployada com o nome correto