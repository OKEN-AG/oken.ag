

# Plano de Desenvolvimento BarterPro — Diagnóstico Completo e Roadmap

## Estado Atual (o que funciona)

### Tabelas existentes no banco (20 tabelas)
`campaigns`, `campaign_products`, `campaign_buyers`, `campaign_channel_segments`, `campaign_channel_types`, `campaign_clients`, `campaign_commodity_valorizations`, `campaign_delivery_locations`, `campaign_distributors`, `campaign_due_dates`, `campaign_indicative_prices`, `campaign_payment_methods`, `campaign_segments`, `combos`, `combo_products`, `commodities_master_data`, `commodity_pricing`, `freight_reducers`, `operation_documents`, `operation_guarantees`, `operation_items`, `operation_logs`, `operation_status_history`, `operations`, `order_pricing_snapshots`, `ports`, `products`, `profiles`, `user_roles`, `collateral_packages`, `collateral_evidences`

### Engines implementados (frontend)
- `combo-cascade.ts` — cascata completa com prioridade
- `parity.ts` — paridade + Black-Scholes
- `orchestrator.ts` — gates por vagão/documento
- `snapshot.ts` — imutabilidade de cálculo
- `calculation-memory.ts` — memória de cálculo insumo/dívida
- `incentives.ts` — incentivos globais

### Engines implementados (backend Edge Functions)
- `simulation-engine` — simulação server-side
- `calculate-engine` — cálculo com crédito
- `server/engines/credit.ts` — parcelas Price/SAC/Bullet
- `server/engines/freight.ts` — redutores logísticos
- `server/engines/insurance.ts` — B&S
- `server/engines/document.ts`, `invoicing.ts`, `monitoring.ts`, `settlement.ts` — stubs parciais

### Steps já extraídos
`ContextStep`, `OrderStep`, `SimulationStep`, `PaymentStep`, `BarterStep`, `FormalizationStep`, `SummaryStep` — porém são **wrappers vazios** (apenas `{children}`). Toda a lógica ainda está no monolítico `OperationStepperPage.tsx` (1960 linhas).

### Hooks já extraídos
- `useOrderWizardState` — estado do wizard (65 linhas, funcional)
- `useOrderCalculations` — cálculos derivados básicos (39 linhas, mínimo)
- `useOrderPersistence` — persistência (existe mas não verificado)

---

## Lacunas Críticas (da Matriz de Cobertura)

| Lacuna | Módulo | Impacto |
|--------|--------|---------|
| Engine Crédito financeiro | 8 | Sem cálculo parcelado Price/SAC/Bullet integrado no fluxo |
| Plano de parcelas por meio | 9, 11 | Sem cronograma/CET visível ao usuário |
| Engine CET por meio/parcela | 12 | Custo efetivo final por composição não calculado |
| Risk/Bureau engine | 17 | Sem score/risco externo |
| Emissão/Faturamento final | 19 | Sem evento `order_issued` + certificados |
| Steps são wrappers vazios | — | OperationStepperPage continua monolítico |

---

## Plano de Execução — 5 Blocos Priorizados

### Bloco 0 — Estabilização (1-2 dias)

| Tarefa | Detalhes |
|--------|---------|
| **Decompor OperationStepperPage** | Mover lógica de cada step para seu componente real. Hoje são wrappers `{children}`. Extrair ~250 linhas por step. |
| **Enriquecer useOrderCalculations** | Mover cálculos de pricing, combo cascade, paridade do monolítico para o hook. |
| **Remover rotas legacy** | Executar Fase A+E do PLANO_REMOCAO: ocultar menus e limpar imports de SimulationPage/ParityPage/DocumentsPage (que já não existem como arquivos). |

### Bloco A — Motor Financeiro (Ondas 8-9, 11-12)

| Tarefa | Detalhes |
|--------|---------|
| **Integrar Credit Engine no fluxo** | O engine `server/engines/credit.ts` já existe com Price/SAC/Bullet. Conectar ao PaymentStep para gerar cronograma de parcelas visível. |
| **Tabelas `credit_lines` e `order_installments`** | Criar via migration para persistir plano de pagamento por operação. |
| **Plano de pagamento no resumo** | Mostrar cronograma com data, valor, meio, CET no SummaryStep. |
| **Engine CET por composição de meios** | Calcular custo efetivo total quando há mix de meios (barter + financeiro). |

### Bloco B — Freight + Paridade Completa (Ondas 11-12)

| Tarefa | Detalhes |
|--------|---------|
| **Integrar Freight Engine** | `server/engines/freight.ts` já existe. Conectar ao BarterStep usando dados de `freight_reducers` já existentes no banco. |
| **UI de redutor logístico** | Mostrar cálculo origem→porto com custo/km no BarterStep. |
| **Paridade com trilha completa** | Exibir decomposição: preço bolsa → basis → frete → deltas → preço líquido → sacas. |

### Bloco C — Governança Documental (Ondas 16-17)

| Tarefa | Detalhes |
|--------|---------|
| **Document Engine funcional** | Evoluir stub em `server/engines/document.ts` para gerar templates de Pedido, Termo Barter, CCV, CPR, Cessão. |
| **Tabela `document_templates`** | Migration com templates versionados por tipo e campanha. |
| **Bloqueio por pendência** | Orchestrator já tem gates — conectar verificação real de `operation_documents` com status. |
| **FormalizationStep real** | Mover lógica de emissão/assinatura do monolítico para o step com UI de checklist documental. |

### Bloco D — Pós-Operação (Ondas 18-20)

| Tarefa | Detalhes |
|--------|---------|
| **Invoicing Engine** | Provisões (margem, financeiro, custo barter), gates de liberação, evento `order_issued`. |
| **Monitoring Dashboard** | Evoluir `MonitoringPage.tsx` existente com dados reais: saúde de garantias, preço commodity, alertas. |
| **Settlement Engine** | Entrega de grãos, conciliação financeira, compensação, encerramento. Tabelas `grain_deliveries`, `settlement_entries`. |

---

## Sequência de PRs Recomendada

```text
PR-1: Decompor OperationStepperPage (mover lógica para steps reais)
PR-2: Integrar Credit Engine + cronograma de parcelas no PaymentStep
PR-3: Integrar Freight Engine + UI de redutor no BarterStep
PR-4: Paridade com trilha de cálculo completa
PR-5: Document Engine + templates + FormalizationStep real
PR-6: Invoicing Engine + gates de liberação
PR-7: Monitoring com dados reais + alertas
PR-8: Settlement Engine + conciliação
```

## Tabelas a Criar (Migrations)

```sql
-- Bloco A
CREATE TABLE credit_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid REFERENCES campaigns(id), name text, method text, interest_rate numeric, max_term_months int, active boolean DEFAULT true);
CREATE TABLE order_installments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid REFERENCES operations(id), installment_number int, due_date date, amount numeric, payment_method text, status text DEFAULT 'pending');

-- Bloco C
CREATE TABLE document_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_type text, version int DEFAULT 1, template_body jsonb, variables text[], active boolean DEFAULT true);

-- Bloco D
CREATE TABLE grain_deliveries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid REFERENCES operations(id), delivery_date date, quantity_tons numeric, warehouse text, status text DEFAULT 'pending');
CREATE TABLE settlement_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid REFERENCES operations(id), entry_type text, amount numeric, reference_doc text, settled_at timestamptz);
```

## Critérios Transversais (todo PR)
- Cálculo financeiro sempre server-side (Edge Function)
- Snapshot obrigatório por simulação/decisão
- `blockingReasons[]` explicáveis em toda transição
- Logs e histórico de status em toda mudança
- Testes unitários por engine

