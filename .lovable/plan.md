

# Plano de Convergencia -- Documentacao vs Sistema Atual

## Resumo da Analise

Analisei os dois documentos (Catalogo de Componentes e Variaveis + Prompt do Sistema de Barter) contra o codigo atual. O Admin de Campanhas e Commodities esta ~80% alinhado. Os engines estao ~70% alinhados. A area de Operacoes esta ~60% alinhada. Abaixo estao as lacunas organizadas por prioridade.

---

## BLOCO 1: Lacunas nos Engines (Logica de Calculo)

### 1.1 Eligibility Engine -- Falta PF/PJ

**Doc exige**: check PF/PJ como flag (campaign tem `client_type` array com "PF"/"PJ").
**Atual**: `checkEligibility()` nao verifica PF/PJ.
**Correcao**: Adicionar campo `clientType?: 'PF' | 'PJ'` ao `EligibilityInput` e validar contra `campaign.client_type` (campo ja existe no banco como array).

### 1.2 Pricing Engine -- Valorizacao por Commodity nao integrada

**Doc exige**: `campaign_commodity_valorizations` (nominal ou %) aplicada no calculo da paridade.
**Atual**: Tabela existe no banco, dados sao salvos no Admin (aba Valorizacao), mas o Parity Engine NAO consulta/aplica.
**Correcao**: No `calculateCommodityNetPrice()`, consultar valorizacao e aplicar antes/depois do basis conforme regra (doc diz "definir ponto").

### 1.3 Parity Engine -- Fee do Comprador nao aplicado

**Doc exige**: `campaign_buyers.fee` reduz preco liquido ou entra como custo.
**Atual**: Compradores sao cadastrados (tabela `campaign_buyers` com `fee`), mas o engine ignora.
**Correcao**: Adicionar parametro `buyerFeePercent` ao `calculateCommodityNetPrice()` e subtrair do preco liquido.

### 1.4 Pricing Engine -- Frete Fallback

**Doc exige**: Se nao houver rota especifica, usar `default_freight_cost_per_km` da aba Financeiro.
**Atual**: Campo existe na tabela `campaigns` (`default_freight_cost_per_km`), mas nao e usado como fallback no calculo.
**Correcao**: No stepper, quando `freightReducer` nao encontrado, calcular fallback com distancia estimada x custo padrao.

### 1.5 Vencimentos por Regiao -- Precedencia

**Doc exige**: municipio > mesorregiao > UF > default.
**Atual**: `campaign_due_dates` tem `region_type` e `region_value`, mas a selecao no stepper nao aplica precedencia.
**Correcao**: No stepper, filtrar due dates pela geo do cliente aplicando precedencia hierarquica.

### 1.6 Insurance Engine -- Parametros do Config

**Doc exige**: Usar volatilidade, taxa livre de risco, custo opcao e strike da configuracao de commodity.
**Atual**: Black-Scholes usa valores parcialmente hardcoded (strike = spot * 1.05, riskFreeRate = 0.1175).
**Correcao**: Usar `pricing.volatility`, `pricing.riskFreeRate`, `pricing.optionCost`, `pricing.strikePercent` do config de commodity.

---

## BLOCO 2: Lacunas no Admin (Pequenos Ajustes -- Sem Reestruturar)

### 2.1 Aba Geral -- Validacao de Ativacao

**Doc exige**: So permitir ativar campanha se: vigencia valida, >= 1 commodity, produtos cadastrados, elegibilidade definida.
**Atual**: Toggle ativa sem validacao.
**Correcao**: Antes de ativar, verificar prerequisitos e mostrar alerta/bloqueio.

### 2.2 Aba Elegibilidade -- PF/PJ Checkboxes

**Doc exige**: Checkboxes "Pessoa Fisica" e "Pessoa Juridica".
**Atual**: Campo `client_type` array existe no banco mas a UI nao tem checkboxes PF/PJ na aba Elegibilidade.
**Correcao**: Adicionar checkboxes PF/PJ na EligibilityTab e salvar em `campaigns.client_type`.

### 2.3 Aba Modulos -- Validacao de Dependencias

**Doc exige**: Barter ativo sem commodity configurada deve gerar alerta/bloqueio.
**Atual**: Modulos sao toggles sem validacao cruzada.
**Correcao**: Ao ativar Barter, verificar se existe `commodity_pricing` para a campanha. Ao ativar Pagamento, verificar se existem `payment_methods`.

### 2.4 Commodities -- Aba Configuracao (Operacional)

**Doc exige**: Periodo de entrega, tipos de preco (pre-existente/fixo/a fixar), contrapartes aceitas, desconto de antecipacao.
**Atual**: Estes campos existem parcialmente na tabela `campaigns` (`delivery_start_date`, `delivery_end_date`, `accepted_counterparties`, `price_types`, `early_discount_enabled`) mas a UI de Commodities nao edita todos.
**Correcao**: Garantir que a aba Configuracao em CommoditiesTab expoe todos estes campos e salva corretamente.

---

## BLOCO 3: Lacunas na Area de Operacoes (Stepper)

### 3.1 Desconto nunca revelado por produto

**Doc exige**: "O desconto nunca e revelado por produto e sempre aplicado no montante ou na quantidade de commodities."
**Atual**: O stepper mostra breakdown por produto no step de simulacao.
**Correcao**: Remover coluna de desconto por produto. Mostrar desconto apenas como total no rodape (combo + incentivos + barter).

### 3.2 Barra de Recomendacao de Combo

**Doc exige**: "Barra indicativa do quanto esta ativando de desconto em relacao ao maximo possivel, recomendando qual produto deve subir a dose ou incluir."
**Atual**: Barra de progresso existe, mas nao ha recomendacao de "qual produto incluir/subir dose".
**Correcao**: Adicionar logica que analisa combos nao ativados e sugere qual produto/dose incluir para maximizar desconto.

### 3.3 Selecao de Comprador no Barter

**Doc exige**: Selecionar comprador da lista de pre-aprovados, ou informar outro para aprovacao. Fee do comprador impacta paridade.
**Atual**: Stepper tem campo `counterparty` (texto livre) mas nao consulta `campaign_buyers`.
**Correcao**: Substituir input de texto por Select com buyers cadastrados + opcao "Outro". Aplicar fee no calculo.

### 3.4 Aba Simplificada de Combos em Sacas

**Doc exige**: "Aba simplificada onde selecionando localidade, cada combo tem valor calculado em sacas para a area informada."
**Atual**: Nao existe.
**Correcao**: Adicionar step ou secao "Quick Pick" que mostra combos pre-calculados em sacas por localidade/area.

### 3.5 Dados Fiscais e de Entrega

**Doc exige**: "Preenchimento completo dos dados para o pedido incluindo informacoes fiscais e de entrega dos produtos."
**Atual**: Stepper coleta apenas nome/doc/cidade/estado.
**Correcao**: Adicionar campos de endereco de entrega, inscricao estadual, CNPJ/CPF formatado, e-mail, telefone no step de Contexto ou antes da Formalizacao.

### 3.6 Snapshot com Valorization Bonus

**Doc exige**: Preco valorizado vs preco contrato com comparativo em % e nominalmente.
**Atual**: Snapshot salva parity mas nao inclui `valorizationBonus` da tabela `campaign_commodity_valorizations`.
**Correcao**: Incluir dados de valorizacao no snapshot.

---

## BLOCO 4: Lacunas Estruturais (Futuro / Fase 2)

Estas lacunas sao mencionadas nos docs mas estao marcadas como "futuro" ou "onda posterior":

- **Tipos de Credito / Credores** (placeholder no Financeiro)
- **RBAC por perfil** (Admin/Marketing/Comercial/BarterDesk/Leitura) -- hoje so tem admin/manager/client
- **Seguro com cotacao real** (mesa de operacoes cota opcao)
- **CCV/Cessao/CPR com templates dinamicos** (Onda 17)
- **Invoicing Engine** (Onda 18)
- **Monitoring Engine com NDVI** (Onda 19)
- **Settlement Engine** (Onda 20)
- **Variable Catalog no banco** (campaign_variable_catalog)

Estes NAO serao implementados neste plano.

---

## Ordem de Implementacao

### Fase A -- Engines (sem mexer no Admin)
1. Eligibility: adicionar check PF/PJ
2. Parity: integrar valorizacao por commodity
3. Parity: aplicar fee do comprador
4. Pricing/Stepper: frete fallback
5. Stepper: precedencia de vencimentos por regiao
6. Insurance: usar params do commodity config

### Fase B -- Pequenos ajustes no Admin
7. Geral: validacao de ativacao de campanha
8. Elegibilidade: checkboxes PF/PJ
9. Modulos: validacao cruzada de dependencias
10. Commodities Configuracao: campos operacionais completos

### Fase C -- Stepper (Operacoes)
11. Remover desconto por produto (mostrar so total)
12. Recomendacao de combo (qual produto incluir)
13. Selecao de comprador com fee
14. Campos fiscais/entrega
15. Snapshot com valorizacao

---

## Arquivos Impactados

| Arquivo | Mudanca |
|---|---|
| `src/engines/eligibility.ts` | + check PF/PJ |
| `src/engines/parity.ts` | + valorizacao, + buyer fee |
| `src/engines/pricing.ts` | Nenhuma (ja OK) |
| `src/engines/snapshot.ts` | + valorizacao no snapshot |
| `src/pages/OperationStepperPage.tsx` | Recomendacao combo, buyer select, campos fiscais, frete fallback, due date precedencia, insurance params, remover desconto por produto |
| `src/components/campaign/EligibilityTab.tsx` | + PF/PJ checkboxes |
| `src/components/campaign/GeneralTab.tsx` | + validacao ativacao |
| `src/components/campaign/CommoditiesTab.tsx` | + campos operacionais completos |
| `src/hooks/useActiveCampaign.ts` | + fetch buyers, valorizacoes |
| `src/types/barter.ts` | + clientType no EligibilityInput |

### Riscos
- Valorizacao: preciso definir em que ponto do calculo ela entra (antes ou depois de basis/frete). Recomendo: depois do basis, antes do frete.
- Fee do comprador: preciso definir se reduz preco liquido ou soma como custo. Recomendo: reduz preco liquido (doc sugere "redutor").
- PF/PJ: campo `client_type` no banco e array de texto. Preciso mapear para flags PF/PJ booleanas.

