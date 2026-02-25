# BarterPro — Arquitetura Unificada (20 Ondas)

## Objetivo
Transformar a base atual em uma plataforma completa de **construção de oferta de venda com crédito embutido**, com múltiplas fontes de recursos, lastro em commodities e liquidação por entrega vinculada/pagamento, preservando os ativos já implementados.

---

## 1. Princípios de arquitetura

1. **Order-first**: pedido é o objeto principal; barter é um plugin de liquidação/pagamento.
2. **Engine-first**: cálculo no backend (fonte única de verdade), frontend renderiza e coleta dados.
3. **Ledger-first**: toda decisão de preço/crédito/paridade/seguro/documento gera memória de cálculo auditável.
4. **Workflow data-driven**: jornada (trem + vagões) definida por campanha/módulo e validada server-side.
5. **Compatibilidade incremental**: coexistência com legado até completar migração.

---

## 2. Reaproveitamento do que já existe (base atual)

### Engines maduras (reaproveitar)
- `pricing.ts`: normalização + decomposição + gross-to-net.
- `combo-cascade.ts`: cascata por desconto e abrangência com consumo de saldo.
- `agronomic.ts`: área × dose com consolidação técnica.
- `parity.ts`: commodity net price + paridade + black-scholes.
- `orchestrator.ts`: gates por etapa/documento.
- `snapshot.ts`: imutabilidade do cálculo.

### Estrutura de dados já existente (reaproveitar)
- campanhas, produtos, combos, operações, itens, documentos, logs, snapshots, histórico de status.
- garantias e colaterais.

### Avanço recente já incorporado
- `commodities_master_data` + UI admin + hook compartilhado de opções de commodity.

---

## 3. Arquitetura lógica final (16 engines)

1. Campaign Engine
2. Product Engine
3. Agronomic Engine
4. Pricing Normalization Engine
5. Combo Cascade Engine
6. Payment Method Engine
7. Commodity Engine
8. Freight Engine
9. Parity Engine
10. Insurance Engine (B&S)
11. Document Engine
12. Guarantee Engine
13. Invoicing Engine
14. Monitoring Engine
15. Settlement Engine
16. Orchestrator Engine

### Sequência de execução
Campaign → Product/Agronomic → Pricing → Combo Cascade → Payment Method → (Financial OR Commodity/Freight/Parity/Insurance) → Document → Guarantee → Invoicing → Monitoring → Settlement.

---

## 4. Modelo de domínio alvo (Order-first)

## 4.1 Núcleo
- `operations` (header order)
- `operation_items`
- `order_pricing_snapshots`
- `operation_logs`
- `operation_status_history`

## 4.2 Pagamento pluginável
- `order_payment_selection` (operation_id, payment_mode, option_id, payload jsonb)
- `barter_details` (operation_id, commodity, local/porto, contraparte, tipo_preco, snapshot_paridade, snapshot_seguro)

## 4.3 Comercial
- `price_lists`
- `price_list_items`
- `offers`
- `offer_rules`

## 4.4 Crédito
- `credit_lines`
- `order_credit_terms`
- `order_installments`

## 4.5 Documentos e garantias
- `document_templates`
- `campaign_document_requirements`
- `document_instances`
- garantias e colaterais já existentes + vínculos por operação/etapa

---

## 5. Jornada (trilho + vagões)

## 5.1 Vagões padrão
1. Termo de adesão
2. Simulação
3. Condições de pagamento
4. Barter (se escolhido)
5. Seguro (opcional)
6. Pedido
7. Formalização
8. Documentos complementares
9. Garantias
10. Liberação/faturamento
11. Monitoramento
12. Liquidação

## 5.2 Regras de avanço
- cada vagão exige entregáveis válidos (documentos/status/checks)
- bloqueios explicáveis na UI
- avanço exclusivamente server-side

---

## 6. Frontend alvo

## 6.1 Estrutura
- `domains/order/*`
- `domains/commercial/*`
- `domains/payment/plugins/{cash,credit,barter}/*`
- `domains/documents/*`
- `domains/risk/*`

## 6.2 Refactor de páginas
- `OperationStepperPage` quebrado em:
  - `ContextStep`
  - `OrderStep`
  - `PricingStep`
  - `PaymentStep`
  - `BarterStep`
  - `FormalizationStep`
  - `SummaryStep`
- hooks:
  - `useOrderWizardState`
  - `useOrderCalculations`
  - `useOrderPersistence`

---

## 7. Backend alvo (Supabase Edge Functions)

## 7.1 Server
`supabase/functions/server/`
- `engines/*` (16 engines)
- `routes/*`
  - campaigns
  - products
  - combos
  - operations
  - commodity-market
  - freight
  - documents
  - guarantees
  - invoicing
  - monitoring
  - settlement
- `utils/*` (validators, math, adapters)

## 7.2 Contratos de API
- `POST /simulate-order`
- `POST /recalculate-order`
- `POST /advance-operation-status`
- `POST /emit-documents`
- `POST /issue-invoice`
- `POST /settle-operation`

Todos retornam:
- payload funcional
- `ledger` detalhado
- `blockingReasons[]`
- snapshot id/version

---

## 8. Mapa funcional por aba (como operar)

## 8.1 Campanha / Condições
- elegibilidade territorial e por segmento
- margens canal
- juros e vencimentos
- limites desconto indústria/revenda
- câmbio produto/barter
- módulos ativos + ordem da jornada

## 8.2 Produtos
- embalagem kg/L
- unidade/caixa/palete/caminhão
- arredondamento obrigatório por fechamento logístico

## 8.3 Combos
- min/max por produto e dose/ha
- prioridade por desconto e abrangência
- cascata sem dupla contagem

## 8.4 Commodity
- parâmetros de precificação (bolsa, contrato, basis, câmbio, deltas, stop)
- redutores logísticos por local
- comprador/contraparte
- sobreposição de preço por contrato existente

## 8.5 Simulação/Pedido
- área + dose ou quantidade nominal
- recomendações agronômicas
- preço prazo final com separação: receita comercial, receita financeira, margem, custo barter
- paridade final + preço referência valorizado

## 8.6 Formalização
- emissão e assinatura de pedido/termo barter
- emissão de CCV/cessão/CPR/garantias conforme campanha
- bloqueio de liberação se pendências

## 8.7 Monitoramento/Liquidação
- saúde de garantias
- saúde produtiva/área (NDVI quando disponível)
- fluxo entrega de grãos e compensação financeira
- provisões e custos programados

---

## 9. Plano de execução (20 ondas em macro-blocos)

## Bloco A (Ondas 1–6) — Digitalização + comercial
- layout + CRUD + simulação + agronômico + pricing + combo cascata
- DoD: simulação completa auditável + gross-to-net

## Bloco B (Ondas 7–12) — preço ponta + barter
- margem canal + commodity + frete + paridade completa
- DoD: operação barter simulada fim-a-fim com sobreposição de preço

## Bloco C (Ondas 13–17) — hedge + governança
- seguro simplificado → B&S
- pedido/termo + CCV/CPR/cessão + garantias
- DoD: trilho documental bloqueando/liberando corretamente

## Bloco D (Ondas 18–20) — faturamento e pós-operação
- invoicing + monitoring + settlement
- DoD: operação liquidada com reconciliação e trilha completa

---

## 10. Critérios de aceite transversais

1. Nenhum cálculo financeiro crítico apenas no frontend.
2. Snapshot obrigatório por simulação/recalculo/decisão.
3. Every stage has explainable `blockingReasons`.
4. Documento emitido com versionamento e vínculo com operação.
5. Logs e histórico de status obrigatórios em toda transição.
6. Compatibilidade com operações legadas durante migração.

---

## 11. Riscos e mitigação

- **Risco**: big-bang em `OperationStepperPage`.
  - Mitigação: extrair hooks e componentes por etapa antes de novos motores.
- **Risco**: divergência client/server nos cálculos.
  - Mitigação: consolidar cálculo em endpoint server-side.
- **Risco**: quebra de jornada por documentos.
  - Mitigação: validação de estágio centralizada no Orchestrator.

---

## 12. Resultado esperado

Plataforma única para:
- construção de oferta comercial com crédito embutido
- liquidação em dinheiro ou barter
- governança documental e de garantias
- faturamento com provisões
- monitoramento e liquidação final

Com trilha auditável fim-a-fim e previsibilidade operacional para indústria, distribuidores e clientes finais.
