# BarterPro — Catálogo de Campos, Variáveis e Dependências (Campanhas)
**Escopo:** Campanhas > Editar Campanha (14 telas: CAMP-EDIT-01…06 e CAMP-COM-01…08)  
**Objetivo do documento:** catalogar **todos os campos** configuráveis da campanha, as **variáveis derivadas** no motor e as **dependências/precedências** (inclui combos em cascata e vencimento por geo).  
**Versão:** v0.1  
**Data:** ____  
**Responsáveis:** Produto / Tech / QA  

---

## 0) Regras-mãe (Canon)

### R1 — Moeda do mínimo do pedido
- `campaign.currency` define a moeda do campo `campaign.eligibility.min_order_amount`.
- Todos os checks de “mínimo” e totais devem ocorrer **na moeda da campanha**.

### R2 — Combos não acumulam e operam em cascata por consumo
- Combos são avaliados em ordem (por `combo.priority` ou ordem de criação).
- Quando um combo aplica, ele **consome saldo** dos itens elegíveis do pedido.
- Os combos seguintes só podem usar o saldo restante.

### R3 — Vencimento por região usa o mesmo universo geo da elegibilidade
- Tudo que existe em `eligibilidade.geo` (UF, Mesorregião, Município) deve existir em `due_dates.geo`.
- A precedência é a mesma: Município > Mesorregião > UF > Default.

### R4 — Preço padrão do produto é sempre Cash
- O motor usa `product.price.cash` como **preço base**.
- `product.price.term` é **referência** (não entra no cálculo do preço final nesta fase).

---

## 1) Taxonomia de Escopo e Resolução

### 1.1 Escopos
- **Campaign:** variável única por campanha.
- **Campaign+Commodity:** variável por campanha e commodity (Soja/Milho/Café/Algodão).
- **Campaign+Geo:** variável por campanha e recorte geográfico (UF/Meso/Município).
- **Campaign+Product:** variável por campanha e produto do portfólio.
- **Campaign+Combo:** variável por campanha e combo (e seus itens).

### 1.2 Precedência geo (R3)
Para elegibilidade geo e vencimento:
1) Município (IBGE)  
2) Mesorregião  
3) UF  
4) Default

Empates no mesmo nível:
- maior `priority` (se existir)
- senão `updated_at` mais recente
- senão menor `id`

---

## 2) Inputs (Campos configuráveis) — Catálogo Canon

> Formato por variável:
> - **var_id** | tipo | escopo | fonte (tela/campo) | obrigatório | default | depende_de | precedência | impacta | persistência | versionável | auditável

### 2.1 CAMP-EDIT-01 — Geral (Campaign Core)

- **campaign.id** | uuid | Campaign | sistema | sim | n/a | n/a | n/a | tudo | `campaign.id` | não | sim
- **campaign.code_auto** | string | Campaign | sistema | sim | n/a | n/a | n/a | UI/relatórios | `campaign.code_auto` | não | sim
- **campaign.code_free** | string | Campaign | CAMP-EDIT-01/código livre | não | null | n/a | n/a | busca/integração | `campaign.code_free` | sim | sim
- **campaign.name** | string | Campaign | CAMP-EDIT-01/nome | sim | n/a | n/a | n/a | UI/relatórios | `campaign.name` | sim | sim
- **campaign.company_responsible** | string | Campaign | CAMP-EDIT-01/empresa | não | null | n/a | n/a | UI | `campaign.company_responsible` | sim | sim
- **campaign.bu_focus** | string | Campaign | CAMP-EDIT-01/BU | não | null | n/a | n/a | UI | `campaign.bu_focus` | sim | sim
- **campaign.season** | string | Campaign | CAMP-EDIT-01/safra | não | null | n/a | n/a | UI | `campaign.season` | sim | sim
- **campaign.description** | string | Campaign | CAMP-EDIT-01/descritivo | não | null | n/a | n/a | UI | `campaign.description` | sim | sim

- **campaign.currency** | enum(BRL,USD,...) | Campaign | CAMP-EDIT-01/moeda | sim | BRL (se definido) | n/a | n/a | R1, mínimos, totais | `campaign.currency` | sim* | sim
  \*Se campanha ativa, mudar moeda deve exigir versionamento (recomendado).

- **campaign.target_audience** | enum | Campaign | CAMP-EDIT-01/público-alvo | não | null | n/a | n/a | UI/regras | `campaign.target_audience` | sim | sim
- **campaign.framework** | enum | Campaign | CAMP-EDIT-01/enquadramento | não | null | n/a | n/a | UI/regras | `campaign.framework` | sim | sim

- **campaign.valid_from** | date | Campaign | CAMP-EDIT-01/início | sim | n/a | n/a | n/a | ativação, pedidos | `campaign.valid_from` | sim* | sim
- **campaign.valid_to** | date | Campaign | CAMP-EDIT-01/fim | sim | n/a | campaign.valid_from | n/a | ativação, pedidos | `campaign.valid_to` | sim* | sim
- **campaign.billing_limit** | number OR date | Campaign | CAMP-EDIT-01/limite faturamento | não | null | n/a | n/a | governança | `campaign.billing_limit` | sim | sim
  > **Nota:** ajustar tipo conforme decisão final (no print aparece como data).

- **campaign.commodities_enabled[]** | enum[] | Campaign | CAMP-EDIT-01/checkbox commodities | sim | [] | n/a | n/a | habilita bloco commodities | `campaign_commodities` | sim* | sim

- **campaign.is_active** | boolean | Campaign | CAMP-EDIT-01/toggle ativa | sim | false | checklist mínimo | n/a | controla uso | `campaign.is_active` | sim | sim

- **campaign.whitelist.items[]** | array | Campaign | CAMP-EDIT-01/grid whitelist | não | [] | n/a | n/a | elegibilidade | `campaign_whitelist` | sim* | sim

---

### 2.2 CAMP-EDIT-02 — Financeiro (Campaign Financial)

- **campaign.fx.products_brl_usd** | number | Campaign | CAMP-EDIT-02/câmbio produtos | sim | n/a | n/a | n/a | normalização | `campaign_financial_params.fx_products` | sim* | sim
- **campaign.fx.barter_brl_usd** | number | Campaign | CAMP-EDIT-02/câmbio barter | sim | n/a | n/a | n/a | paridade/liquidação | `campaign_financial_params.fx_barter` | sim* | sim

- **campaign.interest.rate_am** | number | Campaign | CAMP-EDIT-02/juros a.m. | não | 0 | n/a | n/a | relatórios/referência | `campaign_financial_params.interest_am` | sim | sim

- **campaign.discount.max_internal_pct** | number | Campaign | CAMP-EDIT-02/desc máx interno | não | null | n/a | n/a | governança | `campaign_financial_params.max_disc_internal` | sim | sim
- **campaign.discount.max_reseller_pct** | number | Campaign | CAMP-EDIT-02/desc máx revenda | não | null | n/a | n/a | governança | `campaign_financial_params.max_disc_reseller` | sim | sim

- **campaign.freight.default_rskm** | number | Campaign | CAMP-EDIT-02/frete fallback | não | null | n/a | n/a | CAMP-COM-07 | `campaign_financial_params.default_freight_rskm` | sim | sim

- **campaign.due_date.rules[]** | array | Campaign+Geo | CAMP-EDIT-02/vencimento por região | não | [] | geo universe (R3) | Município>Meso>UF>Default | vencimento | `campaign_due_date_rules` | sim | sim

- **campaign.payment.methods[]** | array | Campaign | CAMP-EDIT-02/meios pagamento | futuro | [] | n/a | n/a | módulo pagamento | `campaign_payment_methods` | sim | sim

---

### 2.3 CAMP-EDIT-03 — Elegibilidade (Campaign Eligibility)

- **campaign.eligibility.allow_pf** | boolean | Campaign | CAMP-EDIT-03/PF | sim | true/false | n/a | n/a | filtros | `campaign_eligibility.allow_pf` | sim | sim
- **campaign.eligibility.allow_pj** | boolean | Campaign | CAMP-EDIT-03/PJ | sim | true/false | n/a | n/a | filtros | `campaign_eligibility.allow_pj` | sim | sim

- **campaign.eligibility.min_order_amount** | number | Campaign | CAMP-EDIT-03/mínimo | não | 0 | campaign.currency (R1) | n/a | R1 | `campaign_eligibility.min_order_amount` | sim | sim
- **campaign.eligibility.min_order_currency** | enum | Campaign | derivada | sim | campaign.currency | campaign.currency | n/a | R1 | `campaign_eligibility.min_order_currency` | derivada | sim

- **campaign.eligibility.geo.uf[]** | array | Campaign+Geo | CAMP-EDIT-03/árvore geo | não | [] | n/a | n/a | R3 | `campaign_geo_eligibility` | sim | sim
- **campaign.eligibility.geo.meso[]** | array | Campaign+Geo | CAMP-EDIT-03/árvore geo | não | [] | n/a | n/a | R3 | `campaign_geo_eligibility` | sim | sim
- **campaign.eligibility.geo.municipio_ibge[]** | array | Campaign+Geo | CAMP-EDIT-03/árvore geo | não | [] | n/a | n/a | R3 | `campaign_geo_eligibility` | sim | sim

- **campaign.eligibility.segments[]** | array | Campaign | CAMP-EDIT-03/segmentos | não | [] | n/a | n/a | filtros futuros | `campaign_customer_segments` | sim | sim

---

### 2.4 CAMP-EDIT-04 — Módulos (Journey)

- **campaign.modules.simulation** | boolean | Campaign | CAMP-EDIT-04/simulação | sim | true | n/a | n/a | jornada | `campaign_modules_enabled.simulation` | sim | sim
- **campaign.modules.insurance** | boolean | Campaign | CAMP-EDIT-04/seguro | sim | false | n/a | n/a | jornada | `campaign_modules_enabled.insurance` | sim | sim
- **campaign.modules.payment** | boolean | Campaign | CAMP-EDIT-04/pagamento | sim | false | campaign.payment.methods[] | n/a | jornada | `campaign_modules_enabled.payment` | sim | sim
- **campaign.modules.barter** | boolean | Campaign | CAMP-EDIT-04/barter | sim | false | configs commodity | n/a | jornada | `campaign_modules_enabled.barter` | sim | sim
- **campaign.modules.formalization** | boolean | Campaign | CAMP-EDIT-04/formalização | sim | false | submódulos | n/a | jornada | `campaign_modules_enabled.formalization` | sim | sim

---

### 2.5 CAMP-EDIT-05 — Produtos (Portfólio)

Por produto (linha):
- **campaign.products[].code** | string | Campaign+Product | CAMP-EDIT-05/código | sim | n/a | n/a | n/a | pedidos | `campaign_products.code` | sim* | sim
- **campaign.products[].name** | string | Campaign+Product | CAMP-EDIT-05/produto | sim | n/a | n/a | n/a | pedidos | `campaign_products.name` | sim* | sim
- **campaign.products[].ref** | string | Campaign+Product | CAMP-EDIT-05/ref | não | null | n/a | n/a | combos | `campaign_products.ref` | sim* | sim

- **campaign.products[].price_cash** | number | Campaign+Product | CAMP-EDIT-05/preço cash | sim | n/a | n/a | n/a | R4 | `campaign_products.price_cash` | sim* | sim
- **campaign.products[].price_term** | number | Campaign+Product | CAMP-EDIT-05/preço prazo | não | null | n/a | n/a | referência | `campaign_products.price_term` | sim | sim

- **campaign.products[].box_size** | number | Campaign+Product | CAMP-EDIT-05/caixa | não | null | n/a | n/a | arredondamento | `campaign_products.box_size` | sim | sim
- **campaign.products[].kg_l** | number | Campaign+Product | CAMP-EDIT-05/kg-l | não | null | n/a | n/a | UI/cálculo | `campaign_products.kg_l` | sim | sim

- **campaign.products[].dose_min_per_ha** | number | Campaign+Product | CAMP-EDIT-05/dose/ha | não | null | n/a | n/a | recomendação | `campaign_products.dose_min` | sim | sim
- **campaign.products[].dose_max_per_ha** | number | Campaign+Product | CAMP-EDIT-05/dose/ha | não | null | dose_min | n/a | recomendação | `campaign_products.dose_max` | sim | sim

---

### 2.6 CAMP-EDIT-06 — Combos

Por combo:
- **campaign.combos[].id** | uuid | Campaign+Combo | sistema | sim | n/a | n/a | n/a | motor combos | `campaign_combos.id` | não | sim
- **campaign.combos[].name** | string | Campaign+Combo | CAMP-EDIT-06/nome | sim | n/a | n/a | n/a | motor combos | `campaign_combos.name` | sim | sim
- **campaign.combos[].discount_pct** | number | Campaign+Combo | CAMP-EDIT-06/desconto% | sim | n/a | n/a | n/a | desconto | `campaign_combos.discount_pct` | sim | sim

- **campaign.combos[].priority** | number | Campaign+Combo | (recomendado adicionar) | não | ordem de criação | n/a | menor primeiro | cascata | `campaign_combos.priority` | sim | sim

Itens:
- **campaign.combos[].items[].product_ref** | string | Campaign+Combo | CAMP-EDIT-06/item | sim | n/a | produto existe | n/a | match | `campaign_combo_items.product_ref` | sim | sim
- **campaign.combos[].items[].dose_min** | number | Campaign+Combo | CAMP-EDIT-06/item | sim | n/a | n/a | n/a | match | `campaign_combo_items.dose_min` | sim | sim
- **campaign.combos[].items[].dose_max** | number | Campaign+Combo | CAMP-EDIT-06/item | sim | n/a | dose_min | n/a | match | `campaign_combo_items.dose_max` | sim | sim

---

## 3) Inputs por Commodity (CAMP-COM-01…08)

> Todos abaixo têm escopo **Campaign+Commodity** (chave: `campaign_id + commodity_code`).

### 3.1 CAMP-COM-01 — Precificação
- **commodity.pricing.exchange** | enum | CAMP-COM-01/bolsa | opcional* | n/a | motor | `campaign_commodity_pricing_config.exchange`
- **commodity.pricing.contract** | enum | CAMP-COM-01/contrato | opcional* | n/a | motor | `...contract`
- **commodity.pricing.spot_price_usd** | number | CAMP-COM-01/preço bolsa | não | null | motor | `...spot_price_usd`
- **commodity.pricing.fx_exchange** | number | CAMP-COM-01/câmbio bolsa | não | null | motor | `...fx_exchange`
- **commodity.pricing.fx_option** | number | CAMP-COM-01/câmbio opção | não | null | motor | `...fx_option`
- **commodity.pricing.option_cost** | number | CAMP-COM-01/custo opção | não | null | motor | `...option_cost`
- **commodity.pricing.delta_market_pct** | number | CAMP-COM-01/delta mercado | não | 0 | motor | `...delta_market_pct`
- **commodity.pricing.delta_freight_rsc** | number | CAMP-COM-01/delta frete | não | 0 | motor | `...delta_freight_rsc`
- **commodity.pricing.stop_loss_pct** | number | CAMP-COM-01/stop loss | não | null | motor | `...stop_loss_pct`
- **commodity.pricing.volatility_pct** | number | CAMP-COM-01/volatilidade | não | null | motor | `...volatility_pct`
- **commodity.pricing.risk_free_rate** | number | CAMP-COM-01/selic | não | null | motor | `...risk_free_rate`
- **commodity.pricing.port_basis[]** | array | CAMP-COM-01/basis porto | não | [] | motor | `campaign_commodity_port_basis`

\*Se `campaign.modules.barter=true`, tornar bolsa/contrato obrigatórios conforme política.

### 3.2 CAMP-COM-02 — Configuração
- **commodity.ops.delivery_start** | date | CAMP-COM-02/início entrega | não | null | valida | `campaign_commodity_operational_config.delivery_start`
- **commodity.ops.delivery_end** | date | CAMP-COM-02/fim entrega | não | null | start | `...delivery_end`
- **commodity.ops.price_type.preexist** | bool | CAMP-COM-02/tipo preço | não | false | n/a | `...price_type_preexist`
- **commodity.ops.price_type.fixed_at_act** | bool | CAMP-COM-02/tipo preço | não | false | n/a | `...price_type_fixed`
- **commodity.ops.price_type.to_fix** | bool | CAMP-COM-02/tipo preço | não | false | n/a | `...price_type_to_fix`
- **commodity.ops.counterparty.preapproved** | bool | CAMP-COM-02/contrapartes | não | false | n/a | `...cp_preapproved`
- **commodity.ops.counterparty.on_demand** | bool | CAMP-COM-02/contrapartes | não | false | n/a | `...cp_on_demand`
- **commodity.ops.counterparty.named_by_creditor** | bool | CAMP-COM-02/contrapartes | não | false | n/a | `...cp_named_by_creditor`
- **commodity.ops.counterparty.own_origination** | bool | CAMP-COM-02/contrapartes | não | false | n/a | `...cp_own_origination`
- **commodity.ops.advance_discount_enabled** | bool | CAMP-COM-02/toggle | não | false | n/a | `...advance_discount_enabled`

### 3.3 CAMP-COM-03 — Valorização
- **commodity.valuation.use_pct** | bool | CAMP-COM-03/toggle | não | false | n/a | `campaign_commodity_valuation_rule.use_pct`
- **commodity.valuation.value_pct** | number | CAMP-COM-03/% | não | null | n/a | `...value_pct`
- **commodity.valuation.value_nominal** | number | CAMP-COM-03/nominal | não | null | n/a | `...value_nominal`

### 3.4 CAMP-COM-04 — Incentivos
- **commodity.incentives.type** | enum | CAMP-COM-04/tipo | não | null | n/a | `campaign_commodity_incentives.type`
- **commodity.incentives.i1_pct** | number | CAMP-COM-04/i1 | não | 0 | n/a | `...i1_pct`
- **commodity.incentives.i2_pct** | number | CAMP-COM-04/i2 | não | 0 | n/a | `...i2_pct`
- **commodity.incentives.i3_pct** | number | CAMP-COM-04/i3 | não | 0 | n/a | `...i3_pct`

### 3.5 CAMP-COM-05 — Compradores
- **commodity.buyers[]** | array(name, fee_pct) | CAMP-COM-05 | não | [] | n/a | `campaign_commodity_buyers`

### 3.6 CAMP-COM-06 — Preços indicativos
- **commodity.indicative_prices[]** | array | CAMP-COM-06 | não | [] | n/a | `campaign_commodity_indicative_prices`

### 3.7 CAMP-COM-07 — Fretes
- **commodity.freight.routes[]** | array(origin,dest,km,rskm,adj,total) | CAMP-COM-07 | não | [] | fallback campaign.freight.default_rskm | `campaign_commodity_freight_routes`

### 3.8 CAMP-COM-08 — Consulta API
- **commodity.api.provider** | enum | CAMP-COM-08 | não | null | n/a | `campaign_commodity_api_config.provider`
- **commodity.api.yahoo_ticker** | string | CAMP-COM-08 | não | null | n/a | `...yahoo_ticker`
- **commodity.api.b3_ticker** | string | CAMP-COM-08 | não | null | n/a | `...b3_ticker`
- **commodity.api.market** | string | CAMP-COM-08 | não | null | n/a | `...market`
- **commodity.api.currency_unit** | enum | CAMP-COM-08 | não | USc | n/a | `...currency_unit`
- **commodity.api.measure_unit** | string | CAMP-COM-08 | não | bushel | n/a | `...measure_unit`
- **commodity.api.bushels_per_ton** | number | CAMP-COM-08 | condicional | null | measure_unit=bushel | `...bushels_per_ton`
- **commodity.api.sack_weight_kg** | number | CAMP-COM-08 | não | 60 | n/a | `...sack_weight_kg`

---

## 4) Variáveis Derivadas (Motor)

### 4.1 Derivadas de elegibilidade (por cliente/pedido)

- **campaign.whitelist.enabled** | bool | Campaign | derivada | `len(whitelist.items) > 0`
- **order.eligibility.pf_pj_ok** | bool | Order | derivada | depende `allow_pf/allow_pj` e tipo do cliente
- **order.eligibility.geo_ok** | bool | Order | derivada | depende seleção geo e geo do cliente
- **order.eligibility.min_ok** | bool | Order | derivada | depende `min_order_amount` e `order.total_amount` (moeda campanha)
- **order.eligibility.whitelist_ok** | bool | Order | derivada | depende `whitelist.enabled` + doc do cliente
- **order.eligibility.final** | bool | Order | derivada | AND de todos (R1)

### 4.2 Derivadas de preço do produto (R4)

- **order.items[].unit_price_base** | number | Order | derivada | `= product.price_cash`
- **order.items[].subtotal_base** | number | Order | derivada | `= qty_selected * unit_price_base`

### 4.3 Derivadas de arredondamento (se pack/caixa existir)

- **order.items[].qty_required** | number | Order | derivada | (se houver dose/área) `= area_ha * dose_per_ha`
- **order.items[].qty_rounded** | number | Order | derivada | `= ceil(qty_required / box_size) * box_size`
- **order.items[].rounding_delta** | number | Order | derivada | `= qty_rounded - qty_required`

> Se o pedido não usa dose/área, `qty_required = qty_selected` e arredondamento é aplicado sobre `qty_selected`.

### 4.4 Derivadas de vencimento por geo (R3)

- **order.due_date.resolved** | date | Order | derivada | resolve por Município > Meso > UF > Default usando `campaign.due_date.rules[]`

### 4.5 Derivadas de combos (R2)

- **order.combo.available_balance[product_ref]** | number | Order | derivada | saldo inicial por produto (qty_rounded ou “área equivalente”)
- **order.combo.applied[]** | array | Order | derivada | lista de combos aplicados
- **order.combo.consumption_ledger[]** | array | Order | derivada | linhas: combo_id, product_ref, consumed_qty(or area), unit_price_base, consumed_subtotal
- **order.combo.discount_total** | number | Order | derivada | soma descontos dos combos aplicados

**Definição padrão recomendada (consistente com consumo):**
- `combo_discount_amount = discount_pct * sum(consumed_subtotal_of_combo_items)`

---

## 5) Algoritmos (Pseudo-código)

### 5.1 Resolver vencimento por geo (R3)
```pseudo
function resolveDueDate(orderGeo, dueDateRules, defaultDueDate=null):
  # orderGeo: {municipio_ibge, meso_id, uf_code}

  candidates = []

  # 1) municipio
  candidates += rules where scope_level="MUNICIPIO" and scope_value=orderGeo.municipio_ibge

  # 2) meso
  if candidates empty:
    candidates += rules where scope_level="MESO" and scope_value=orderGeo.meso_id

  # 3) uf
  if candidates empty:
    candidates += rules where scope_level="UF" and scope_value=orderGeo.uf_code

  # 4) default
  if candidates empty and defaultDueDate != null:
    return defaultDueDate

  # desempate
  chosen = sort(candidates by priority desc, updated_at desc, id asc).first()

  return chosen.due_date
```

### 5.2 Combos em cascata com consumo (R2)
Versão 1x por combo (aplica no máximo uma vez).

```pseudo
function applyCombosCascade(orderItems, combos):
  # orderItems: list of {product_ref, qty, unit_price_base, dose_per_ha?, area_ha?}
  # combos: list of {id, discount_pct, priority, items: [{product_ref, dose_min, dose_max}]}

  combosSorted = sort(combos by priority asc, created_at asc)

  # saldo inicial (padrão): qty disponível por produto
  available = map product_ref -> qty

  for item in orderItems:
    available[item.product_ref] = item.qty

  applied = []
  ledger = []
  totalDiscount = 0

  for combo in combosSorted:
    # checar elegibilidade do combo com base no saldo restante
    if not isComboEligible(combo, orderItems, available):
      continue

    # calcular consumo mínimo para "ativar" combo uma vez
    consumption = computeComboConsumption(combo, orderItems, available)
    # consumption: list of {product_ref, consumed_qty, unit_price_base}

    if consumption is empty:
      continue

    # registrar consumo + reduzir saldo
    consumedSubtotal = 0
    for c in consumption:
      available[c.product_ref] -= c.consumed_qty
      lineSubtotal = c.consumed_qty * c.unit_price_base
      consumedSubtotal += lineSubtotal
      ledger.append({combo_id: combo.id, product_ref: c.product_ref, consumed_qty: c.consumed_qty,
                     unit_price_base: c.unit_price_base, consumed_subtotal: lineSubtotal})

    discountAmount = consumedSubtotal * (combo.discount_pct / 100.0)
    totalDiscount += discountAmount

    applied.append({combo_id: combo.id, discount_pct: combo.discount_pct,
                    consumed_subtotal: consumedSubtotal, discount_amount: discountAmount})

  return {applied, ledger, totalDiscount, available}
```

Funções auxiliares (conceito):
- `isComboEligible`: verifica se todos os itens do combo existem no pedido e têm saldo suficiente e dose dentro do range.
- `computeComboConsumption`: decide quanto consumir para ativar 1x; default = consumir a “quantidade mínima” compatível com as doses/config do pedido (ou uma política fixa por produto, se existir).

Se preferir consumo por “área equivalente” (mais consistente com dose), substituir `available_qty` por `available_area` por produto.

---

## 6) Checklist de consistência (para ativar campanha)

### 6.1 Condições mínimas recomendadas
- `campaign.valid_from` e `campaign.valid_to` válidos
- `campaign.currency` definido
- ≥ 1 `campaign.commodities_enabled`
- Portfólio com ≥ 1 produto e `price_cash` preenchido
- Elegibilidade: (PF ou PJ) e geo ou whitelist (pelo menos um filtro)
- Se `campaign.modules.barter = true`:
  - configs mínimas por commodity habilitada (precificação e configuração operacional)
- Se `campaign.due_date.rules` existir:
  - validação do universo geo (UF/Meso/Mun) conforme R3

---

## 7) Persistência sugerida (estrutura mínima)

### 7.1 Tabelas-base
- `campaign`
- `campaign_commodities`
- `campaign_whitelist`
- `campaign_financial_params`
- `campaign_due_date_rules` (com `scope_level` em UF/MESO/MUNICIPIO/DEFAULT)
- `campaign_eligibility`
- `campaign_geo_eligibility`
- `campaign_customer_segments`
- `campaign_modules_enabled`
- `campaign_products`
- `campaign_combos`
- `campaign_combo_items`
- `campaign_commodity_*` (pricing, ops, valuation, incentives, buyers, indicative_prices, freight_routes, api_config)

### 7.2 Snapshot (recomendado para auditoria e explicabilidade)
- `order_pricing_snapshot` (json com:
  - inputs usados
  - combos aplicados
  - ledger de consumo
  - vencimento resolvido
  - totais e descontos)

---

## 8) Erros/Mensagens padrão (mínimo)

### 8.1 Validações de campanha
- Vigência inválida (fim < início)
- Moeda obrigatória
- Pelo menos uma commodity
- Produto sem preço cash
- Elegibilidade vazia (sem geo e sem whitelist) — se for obrigatório

### 8.2 Combos
- Dose mín > dose máx
- Produto duplicado dentro do combo
- Combo sem itens
- Combo não aplicou por falta de saldo (explicável via ledger)

### 8.3 Vencimento por região
- Regra duplicada no mesmo escopo (mesmo `scope_level + scope_value`)
- Escopo inválido (fora de UF/MESO/MUNICIPIO/DEFAULT)

---

## 9) Casos de teste (QA) — focados em dependências

### 9.1 R1 (moeda do mínimo)
- Alterar `campaign.currency` muda label/unidade do mínimo.
- `min_ok` compara sempre na moeda da campanha.

### 9.2 R2 (combos em cascata)
- Pedido com saldo suficiente para 2 combos → aplica combo 1 e consome saldo; combo 2 aplica com saldo restante.
- Se combo 1 consome tudo de um produto → combo 2 falha por saldo insuficiente, e o motivo fica no ledger.
- Ordem por `priority` altera resultado final (teste determinístico).

### 9.3 R3 (vencimento por geo)
- Regra municipal sobrescreve meso e UF.
- Ausência municipal cai para meso; ausência meso cai para UF; ausência UF cai para default.
- Empate no mesmo nível resolve por `priority`.

### 9.4 R4 (cash sempre)
- Alterar `price_term` não altera total.
- Total sempre baseado em `price_cash`.
