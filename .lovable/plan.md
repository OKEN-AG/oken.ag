

# Diagnóstico Completo — O que falta no BarterPro

## Estado Real da Decomposição (Bloco 0)

### ✅ COMPLETO
- `ContextStep` — componente real com props tipadas (campanha, cliente, localização, elegibilidade)
- `OrderStep` — componente real com grid de produtos, dose/qtd, combos
- `useProductSelection` hook — toggleProduct, updateDose, packaging variants
- `useComboEngine` hook — cascade, recomendações, ativações
- `SimulationStep`, `PaymentStep`, `BarterStep`, `FormalizationStep`, `SummaryStep` — todos com UI real

---

## Lacunas por Bloco — Status Atualizado

### Bloco 0 — Estabilização ✅ COMPLETO

### Bloco A — Motor Financeiro ✅ COMPLETO
| Item | Status |
|------|--------|
| Credit Engine (Price/SAC/Bullet) | ✅ Frontend `src/lib/credit-engine.ts` + Backend `server/engines/credit.ts` |
| Cronograma de parcelas no PaymentStep | ✅ Tabela expandível com método de amortização selecionável |
| Tabela `order_installments` | ✅ Migration criada com RLS |
| CET por composição de meios | ✅ CET anual calculado e exibido |

### Bloco B — Freight + Paridade ✅ COMPLETO
| Item | Status |
|------|--------|
| Trilha completa (bolsa→basis→frete→deltas→preço) | ✅ Expandível no BarterStep |
| Paridade com decomposição | ✅ 7 etapas visíveis com fórmulas |

### Bloco C — Governança Documental ✅ COMPLETO
| Item | Status |
|------|--------|
| FormalizationStep | ✅ Com checklist PoE/PoL/PoD |
| Document Templates | ✅ Tabela `document_templates` + seeds (Pedido, Termo Barter, CPR) |
| Geração de documento | ✅ `src/lib/document-generator.ts` com HTML estruturado |
| Botão Visualizar | ✅ Dialog de pré-visualização no FormalizationStep |
| DocumentData passado do stepper | ✅ Props tipadas com dados da operação |

### Bloco D — Pós-Operação (PENDENTE)
| Item | Status |
|------|--------|
| Invoicing Engine | Stub no backend |
| Monitoring Dashboard | Página existe — conteúdo não verificado |
| Settlement Engine | Stub no backend |
| Tabelas `grain_deliveries` / `settlement_entries` | Não existem |

---

## Próximos Passos

### PR-5: Invoicing Engine
1. Criar migration `grain_deliveries`, `settlement_entries`
2. Implementar provisionamento automático
3. Integrar com MonitoringPage

### PR-6: Monitoring Dashboard
1. Dashboard de saúde da operação
2. Variação de preço commodity
3. Alertas de risco

### PR-7: Settlement Engine
1. Registro de entrega de grãos
2. Conciliação financeira
3. Compensação automática
