

# Diagnóstico Completo — O que falta no BarterPro

## Estado Real da Decomposição (Bloco 0)

A decomposição dos steps **não foi completada**. O arquivo `OperationStepperPage.tsx` continua com **1750 linhas** porque:

- **`ContextStep` e `OrderStep` ainda são wrappers vazios** (`{children}`) — toda a UI (~600 linhas) do contexto e do pedido/catálogo de produtos continua inline no monolítico (linhas 1096-1498).
- `SimulationStep`, `PaymentStep`, `BarterStep`, `FormalizationStep` e `SummaryStep` foram extraídos com props, mas são componentes leves (30-140 linhas cada). A lógica pesada (hooks, queries, handlers, combo cascade local) permanece no monolítico.

### Tarefa pendente: Extrair ContextStep e OrderStep reais

`ContextStep` (linhas 1096-1254): ~160 linhas de UI com seleção de campanha, cidade, distribuidor, elegibilidade, vencimento.

`OrderStep` (linhas 1258-1498): ~240 linhas de UI com grid de produtos, dose/qtd livre, embalagens, barra de combos, recomendações.

---

## Lacunas por Bloco

### Bloco 0 — Estabilização (INCOMPLETO)
| Item | Status |
|------|--------|
| Extrair ContextStep real | Falta — wrapper vazio |
| Extrair OrderStep real | Falta — wrapper vazio |
| Mover lógica de combo/produto para hook | Falta — `getComboRecommendations`, `toggleProduct`, `productGroups` etc. vivem no monolítico |
| Remover rotas legacy | Não verificado |

### Bloco A — Motor Financeiro
| Item | Status |
|------|--------|
| Credit Engine (Price/SAC/Bullet) | Backend existe (`server/engines/credit.ts`) — não integrado no fluxo UI |
| Cronograma de parcelas no PaymentStep | Falta — PaymentStep mostra apenas montante final |
| Tabelas `credit_lines` / `order_installments` | Não existem no banco |
| CET por composição de meios | Não implementado |

### Bloco B — Freight + Paridade
| Item | Status |
|------|--------|
| Freight Engine integrado | Backend existe — BarterStep mostra redutor mas sem trilha de cálculo detalhada |
| Trilha completa (bolsa→basis→frete→deltas→preço) | Falta — BarterStep mostra apenas preço net final |
| Paridade com decomposição | Parcialmente no backend, UI mostra resultado final sem breakdown |

### Bloco C — Governança Documental
| Item | Status |
|------|--------|
| FormalizationStep | Implementado com checklist PoE/PoL/PoD |
| Document Engine funcional | Backend é stub — emite/assina/valida mudando status mas sem geração de template real |
| Tabela `document_templates` | Não existe |
| Geração PDF | Não implementada |

### Bloco D — Pós-Operação
| Item | Status |
|------|--------|
| Invoicing Engine | Stub no backend |
| Monitoring Dashboard | Página existe (`MonitoringPage.tsx`) — não verificado conteúdo |
| Settlement Engine | Stub no backend |
| Tabelas `grain_deliveries` / `settlement_entries` | Não existem |

---

## Plano de Execução — Próximos Passos Priorizados

### PR-1: Completar Decomposição (Bloco 0)

1. **Extrair `ContextStep` real** — mover a UI de seleção de campanha, cidade, distribuidor, elegibilidade, vencimento (linhas 1096-1254) para o componente, recebendo props tipadas.

2. **Extrair `OrderStep` real** — mover grid de produtos, barra de combos, lógica de dose/qtd livre, embalagens, recomendações (linhas 1258-1498) para o componente.

3. **Extrair hook `useProductSelection`** — mover `toggleProduct`, `updateDose`, `updateDoseForRef`, `clearOrder`, `addPackagingVariant`, `removePackagingVariant`, `productGroups` para um hook dedicado.

4. **Extrair hook `useComboEngine`** — mover `localComboResult`, `comboRecommendations`, `getComboRecommendations` para hook.

Meta: `OperationStepperPage` fica com ~400-500 linhas (orquestração + dados).

### PR-2: Integrar Credit Engine no PaymentStep

1. Chamar `simulation-engine` ou nova Edge Function com método de amortização selecionado.
2. Exibir cronograma de parcelas (data, principal, juros, pagamento, saldo).
3. Criar migration para `order_installments`.
4. Persistir plano no save.

### PR-3: Trilha de Paridade no BarterStep

1. Exibir decomposição: preço bolsa → câmbio → basis → redutor frete → deltas → fee comprador → valorização → preço net.
2. Cada linha clicável para ver fórmula.

### PR-4: Document Templates + Geração

1. Criar migration `document_templates`.
2. Implementar geração de texto estruturado (JSON→HTML) para Pedido, Termo Barter, CPR.
3. Botão "Visualizar" no FormalizationStep.

