# Auditoria Completa: O que falta dos 3 planos aprovados

Fiz uma varredura completa do codigo, banco e UI. Abaixo esta o status real de CADA item mapeado nos planos, organizado por "feito" vs "faltando".

---

## STATUS GERAL


| Plano                      | Itens mapeados | Feitos | Faltando |
| -------------------------- | -------------- | ------ | -------- |
| Plano 1 (Convergencia Doc) | 15             | 12     | 3        |
| Plano 2/3 (Agrotoken)      | 18             | 10     | 8        |
| **TOTAL**                  | **33**         | **22** | **11**   |


---

## O QUE ESTA FEITO (22 itens)

**Engines:**

- Eligibility: check PF/PJ com `campaignClientTypes`
- Parity: valorizacao por commodity (nominal + %)
- Parity: fee do comprador aplicado como redutor
- Parity: IVP haircut para contratos "A Fixar"
- Pricing: frete fallback com `default_freight_cost_per_km`
- Insurance: parametros (volatility, riskFreeRate, strikePercent) vindos do commodity config
- Orchestrator: gates PoE/PoL para transicao garantido->faturado
- Orchestrator: `calculateGuaranteeCoverage` implementado
- Snapshot: campos IP, IVP, aforo, cobertura, contractPriceType, cessionChain

**Admin UI:**

- EligibilityTab: checkboxes PF/PJ
- CommoditiesTab: campos operacionais (delivery dates, price types, counterparties, incentivos, buyers, valorizations)

**Stepper UI:**

- Desconto nunca revelado por produto (so total no rodape)
- Recomendacao de combo (qual produto incluir/subir dose)
- Selecao de comprador da lista de pre-aprovados com fee
- Campos fiscais (IE, email, telefone, endereco entrega)
- Tipo de preco do contrato (PF/PAF/pre-existente)
- Checklist PoE/PoL/PoD agrupado por categoria
- Painel de cobertura de garantias com IP editavel
- Due dates com precedencia (municipio > meso > estado)
- Padrao de linguagem BarterPro (sem siglas tecnicas)

**Banco:**

- `operations`: campos `performance_index`, `price_variation_index`, `aforo_percent`, `contract_price_type`
- `operation_documents`: campo `guarantee_category`
- `profiles`: campos `inscricao_estadual`, `car_number`, `land_type`, `farm_name`, `farm_address`, `bank_*`, `pix_key`
- Tabela `operation_guarantees` criada com RLS

---

## O QUE FALTA (11 itens) -- detalhamento  
Remover qualquer menção a Agrotoken e Falar apenas de BarterPRO

### GRUPO A: Admin (2 itens do Plano 1)

**A1. Validacao de ativacao de campanha (Plano 1, item 2.1)**

- Hoje: toggle "Campanha Ativa" no `GeneralTab` ativa sem nenhuma verificacao
- Falta: antes de ativar, verificar: vigencia valida (start_date/end_date), >= 1 commodity configurada, >= 1 produto vinculado, elegibilidade definida (pelo menos 1 estado/cidade)
- Arquivo: `src/components/campaign/GeneralTab.tsx`
- Impacto: Logica de UI apenas, sem mudanca no banco

**A2. Validacao de dependencias de modulos (Plano 1, item 2.3)**

- Hoje: modulos sao toggles independentes em CampaignFormPage
- Falta: ao ativar "Barter", verificar se existe commodity_pricing. Ao ativar "Pagamento", verificar se existem payment_methods. Mostrar alerta/toast se faltar prerequisito
- Arquivo: `src/pages/admin/CampaignFormPage.tsx` (onde os modulos sao gerenciados)
- Impacto: Logica de UI apenas

### GRUPO B: Quick Pick (1 item do Plano 1)

**B1. Aba simplificada de combos em sacas (Plano 1, item 3.4)**

- Hoje: nao existe
- Falta: secao ou sub-aba no step de Pedido ou um step dedicado "Quick Pick" onde o usuario seleciona localidade e area, e cada combo mostra seu valor pre-calculado em sacas. Selecionar um combo auto-preenche a simulacao
- Arquivo: `src/pages/OperationStepperPage.tsx` (nova secao dentro do step "order")
- Impacto: UI + calculo local (sem banco novo)

### GRUPO C: Trilha de Auditoria / State Machine (2 itens do Plano 3 - EPIC A)

**C1. Tabela `operation_status_history` (Plano 3, EPIC A)**

- Hoje: `operation_logs` registra acoes, mas nao ha tabela dedicada para historico de status com timestamps formais
- Falta: criar tabela `operation_status_history` (operation_id, from_status, to_status, changed_by, changed_at, notes) para auditoria formal de cada transicao
- Impacto: Migration SQL + RLS + gravar ao chamar `handleAdvanceStatus`

**C2. Aforo no Admin (FinancialTab)**

- Hoje: campo `aforo_percent` existe no banco (campaigns) mas NAO esta exposto em nenhuma aba do Admin
- Falta: adicionar campo "Aforo / Sobrecolateralizacao (%)" na aba Financeiro
- Arquivo: `src/components/campaign/FinancialTab.tsx`
- Impacto: 1 campo de Input

### GRUPO D: Portal de Contrapartes (2 itens do Plano 3 - EPIC B)

**D1. Portal do Comprador / Oraculo**

- Hoje: compradores sao cadastrados na aba Commodities do Admin, mas nao ha portal onde o comprador possa: ver contratos, aceitar cessao, confirmar pagamento
- Falta: nova pagina `/compradores` com listagem de contratos (CCV) vinculados, status de cessao, e botoes de acao (aceitar/rejeitar)
- Impacto: nova rota + nova pagina + possivelmente novas tabelas (buyer_contracts)

**D2. Portal do Provedor de Liquidez**

- Hoje: nao existe
- Falta: pagina para provedores verem pacotes de garantia, aprovar/rejeitar colateral, acompanhar liquidacao
- Nota: Este item e mais avancado e depende de RBAC expandido. Pode ser adiado

### GRUPO E: Collateral Package (2 itens do Plano 3 - EPIC C)

**E1. Tabela `collateral_packages**`

- Hoje: temos `operation_guarantees` (registro simples de garantias) mas nao o conceito de "pacote" com status completo (draft -> pending_docs -> eligible -> delivered -> settled)
- Falta: tabela com campos: poe_type, pol_type, delivery_due_date, quantity_ton, equivalent_sacks, ip_index, status (com state machine proprio)
- Nota: Pode ser implementado como extensao de `operation_guarantees` ou tabela separada

**E2. Tabela `collateral_evidences**`

- Hoje: documentos existem em `operation_documents` mas nao ha subtabela de "evidencias" com metadados extraidos, aceite formal
- Falta: tabela vinculando documentos a pacotes de garantia com campos de aceite (quem aceitou, quando) e metadados extraidos do CCV/CPR

### GRUPO F: Document Engine Workflow (2 itens do Plano 3 - EPIC D)

**F1. Campos de cessao no banco**

- Hoje: `operation_documents` de tipo `cessao_credito` tem apenas status generico (pendente/emitido/assinado/validado)
- Falta: campos `counterparty_notified` (boolean), `cession_accepted` (boolean), `notification_method` (text: 'notificacao' ou 'tripartite'), `notified_at` (timestamp) na tabela ou no campo `data` (JSONB)
- Decisao: usar o campo `data` JSONB ja existente em `operation_documents` para guardar esses metadados, evitando migration

**F2. Regra: cessao so "valida" com aceite do comprador**

- Hoje: qualquer documento pode ser marcado como "validado" com um clique
- Falta: para documentos do tipo `cessao_credito`, exigir que `counterparty_notified = true` antes de permitir status "validado". Logica no UI (bloquear botao) e no Orchestrator (nao contar como PoL valido sem notificacao)
- Arquivo: `src/pages/OperationStepperPage.tsx` (handleDocAction) + `src/engines/orchestrator.ts`

---

## ORDEM DE IMPLEMENTACAO RECOMENDADA

### Lote 1 -- Rapidos e de alto impacto (sem migration)

1. **A1**: Validacao de ativacao de campanha
2. **A2**: Validacao de dependencias de modulos
3. **C2**: Campo aforo no FinancialTab
4. **F1**: Metadados de cessao via campo `data` JSONB (sem migration)
5. **F2**: Regra de cessao com aceite no UI e Orchestrator

### Lote 2 -- Migration + UI

6. **C1**: Tabela `operation_status_history` + gravar no handleAdvanceStatus
7. **B1**: Quick Pick de combos em sacas

### Lote 3 -- Novas paginas (maior esforco)

8. **D1**: Portal do Comprador (pagina + tabelas auxiliares)
9. **E1**: Collateral packages (tabela + logica)
10. **E2**: Collateral evidences (subtabela)
11. **D2**: Portal Provedor de Liquidez (pode ser Fase 2)

---

## Arquivos impactados


| Arquivo                                     | Mudanca                                    |
| ------------------------------------------- | ------------------------------------------ |
| `src/components/campaign/GeneralTab.tsx`    | + validacao ativacao (A1)                  |
| `src/pages/admin/CampaignFormPage.tsx`      | + validacao modulos (A2)                   |
| `src/components/campaign/FinancialTab.tsx`  | + campo aforo (C2)                         |
| `src/pages/OperationStepperPage.tsx`        | + Quick Pick (B1), cessao workflow (F1/F2) |
| `src/engines/orchestrator.ts`               | + regra cessao validada (F2)               |
| Migration SQL                               | + operation_status_history (C1)            |
| Nova pagina `src/pages/BuyerPortalPage.tsx` | Portal comprador (D1)                      |
| Nova pagina `src/pages/CollateralPage.tsx`  | Pacotes garantia (E1/E2)                   |


### Nota sobre os Lotes

- **Lote 1** pode ser feito agora, sem migration, com impacto imediato na qualidade
- **Lote 2** requer migration simples
- **Lote 3** sao features novas completas, recomendo fazer uma de cada vez

Recomendo comecar pelo Lote 1 (5 itens) que resolve as lacunas mais visiveis sem complexidade de banco.