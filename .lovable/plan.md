

# Auditoria Critica do Codigo Refatorado - BarterPro

## O que FAZ sentido (implementado corretamente)

### Engines de Calculo (Solidos)
- **Pricing Normalization Engine**: Decomposicao completa com 4 camadas (juros, margem, segmento, payment method) + audit trail
- **Combo Cascade Engine**: Logica de cascata com priorizacao por desconto e abrangencia, complementares separados
- **Agronomic Engine**: Dose x Area com arredondamento para caixa fechada
- **Parity Engine**: Conversao montante -> sacas com Black-Scholes integrado
- **Orchestrator Engine**: Metafora do trem com gates documentais por modulo

### Integracao Admin -> Operacao (Funcionando)
- I1: Payment method markup aplicado na precificacao
- I2: Segment price adjustment aplicado
- I4: Validacao de elegibilidade (cidade/estado/segmento) com warnings visuais
- I7: Incentivos globais (desconto direto, credito liberacao, credito liquidacao)
- G1: Audit trail de formacao de preco por produto
- Commodities, combos e produtos vindo do banco (sem hardcode)

### Arquitetura de Dados
- 22 tabelas cobrindo todo o ciclo
- Separacao adequada entre configuracao de campanha e dados operacionais
- Logs de operacao com detalhes estruturados

---

## O que NAO faz sentido / Problemas Criticos

### 1. RISCO ALTO: riskFreeRate hardcoded (linha 79, ParityPage.tsx)
```
riskFreeRate: 0.1175, // SELIC - could be parameterized further
```
Taxa Selic hardcoded no frontend. Deveria ser parametro da campanha ou da configuracao de commodity. Impacto direto no calculo de seguro B&S.

**Correcao**: Adicionar coluna `risk_free_rate` na tabela `commodity_pricing`.

### 2. RISCO ALTO: defaultCostPerKm hardcoded (linha 161, ParityPage.tsx)
```
const defaultCostPerKm = 0.11;
```
Custo de frete fallback hardcoded. No agro brasileiro, frete varia de R$0.08 a R$0.18/km dependendo da regiao e safra.

**Correcao**: Parametrizar na campanha ou na tabela de commodity_pricing.

### 3. RISCO ALTO: Coordenadas de portos hardcoded (linhas 237-244, ParityPage.tsx)
Apesar do H4 ter sido "resolvido", os 6 portos continuam com fallback hardcoded. Se um novo porto for adicionado via admin (ex: Barcarena/PA), nao tera coordenadas.

**Correcao**: Criar tabela `ports` com nome, lat, lng vinculada a campanha ou global.

### 4. RISCO MEDIO: Modulos nao controlam sidebar corretamente
O `AppSidebar.tsx` filtra por `activeModules`, mas na campanha de teste `active_modules` esta vazio (`[]`). Quando vazio, mostra tudo - comportamento correto como fallback, mas confuso. O admin salva modulos mas o usuario nao percebe mudanca porque o fallback e "tudo visivel".

**Correcao**: Quando `activeModules` esta vazio, mostrar aviso no admin. Considerar default de modulos obrigatorios.

### 5. RISCO MEDIO: Elegibilidade so avisa, nao bloqueia
A elegibilidade (I4) mostra warnings mas nao impede salvar a operacao. Um vendedor pode criar pedido para cidade inelegivel, gerando risco juridico.

**Correcao**: Adicionar flag `block_ineligible` na campanha. Se ativo, desabilitar botoes de salvar.

### 6. RISCO MEDIO: Due dates vinculadas por meses, nao por data
A simulacao converte datas de vencimento em "meses ate o vencimento" (diffMonths). Isso muda o calculo de juros a cada dia que passa. Deveria usar a data exata para calculo de juros compostos `(dias/30)` ou `(dias/360)`.

**Correcao**: Usar `differenceInDays` do date-fns e calcular juros pro-rata.

### 7. RISCO MEDIO: Sem validacao de min_order_amount
O campo `min_order_amount` existe na campanha mas nunca e checado na simulacao. Um pedido de R$100 passa normalmente.

**Correcao**: Validar `grossToNet.grossRevenue >= campaign.min_order_amount` antes de salvar.

### 8. RISCO BAIXO: channel_margins vazio nao afeta nada
A campanha de teste tem `channel_margins` vazio. O engine de pricing pula a etapa de margem silenciosamente. Isso pode significar que o preco final esta SEM margem de distribuidor, mas o usuario nao sabe.

**Correcao**: Mostrar warning na simulacao quando margem = 0 e target != 'direto'.

### 9. RISCO BAIXO: useRealtimePricing faz dupla chamada
O hook chama `supabase.functions.invoke` (linha 45) E depois faz `fetch` direto (linha 56). A primeira chamada e ignorada. Codigo morto que pode causar confusao.

**Correcao**: Remover o bloco `supabase.functions.invoke` nas linhas 45-48.

### 10. RISCO BAIXO: Delivery locations sem validacao de dados obrigatorios
A tabela `campaign_delivery_locations` tem `latitude` e `longitude` com default 0. O sistema avisa (G2), mas permite calcular distancia com coordenadas (0,0) - que e o Golfo da Guine, nao Brasil.

**Correcao**: Validar `lat/lng` dentro de bounds brasileiros (-35 a 5 lat, -74 a -35 lng).

### 11. ESTRUTURAL: Fretes nao importaveis/editaveis inline
A tabela `freight_reducers` existe mas nao ha UI para importar/editar fretes na aba de Commodities. Um operador nao consegue configurar a base logistica.

**Correcao**: Adicionar sub-aba de Fretes na CommoditiesTab com import CSV e edicao inline.

### 12. ESTRUTURAL: Precificacao por commodity unica, valorizacao por multiplas
A tabela `commodity_pricing` permite multiplos registros por campanha (1 por commodity), mas `useCampaignData` retorna apenas o primeiro (`rawCommodityData[0]`) como `commodityPricing` default. ParityPage corrige isso com `selectedCommodity`, mas SimulationPage nao filtra.

**Correcao**: Remover o fallback `rawCommodityData[0]` e forcar selecao explicita.

---

## Plano de Correcoes (Priorizado)

### Fase A - Correcoes Criticas (Bloqueantes)
1. Mover `riskFreeRate` para `commodity_pricing` (migracao + UI + engine)
2. Mover `defaultCostPerKm` para parametro de campanha
3. Remover dupla chamada em `useRealtimePricing`
4. Validar `min_order_amount` na simulacao
5. Validar coordenadas dentro de bounds Brasil

### Fase B - Integridade Operacional
6. Calcular juros pro-rata por dias (nao por meses arredondados)
7. Elegibilidade bloqueante (opcao na campanha)
8. Warning de margem zero quando target != direto
9. Criar tabela/UI de portos com coordenadas

### Fase C - Usabilidade Admin
10. UI de import/edicao de fretes
11. Forcar selecao explicita de commodity (remover fallback)
12. Indicador visual no admin quando modulos estao vazios

### Detalhes Tecnicos

**Migracao SQL necessaria (Fase A)**:
```text
ALTER TABLE commodity_pricing ADD COLUMN IF NOT EXISTS risk_free_rate NUMERIC DEFAULT 0.1175;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS default_freight_cost_per_km NUMERIC DEFAULT 0.11;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS block_ineligible BOOLEAN DEFAULT false;
```

**Arquivos a modificar**:
- `src/hooks/useRealtimePricing.ts` - Remover chamada duplicada
- `src/pages/ParityPage.tsx` - Usar risk_free_rate da DB, validar coords
- `src/pages/SimulationPage.tsx` - Validar min_order, pro-rata juros, warning margem
- `src/engines/pricing.ts` - Juros pro-rata dias/360
- `src/components/campaign/CommoditiesTab.tsx` - Campo risk_free_rate, sub-aba fretes
- `src/components/campaign/FinancialTab.tsx` - Campo default_freight_cost_per_km

**Estimativa**: 12 correcoes, ~8 arquivos modificados, 1 migracao SQL.

