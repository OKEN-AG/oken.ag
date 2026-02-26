# Plano Único — Remoção de Legados e Migração para Order-First

## Objetivo
Eliminar fluxos e artefatos legados (simulação/paridade/documentos legacy) e consolidar uma única jornada order-first com Barter como plugin de pagamento/liquidação.

---

## 1) Escopo de remoção de legacy

### 1.1 Rotas legadas a descontinuar
- `/simulacao`
- `/paridade`
- `/documentos`

### 1.2 Entradas de navegação legadas a remover
- `Simulação (Legacy)`
- `Paridade (Legacy)`
- `Documentos (Legacy)`

### 1.3 Páginas legadas a aposentar
- `src/pages/SimulationPage.tsx`
- `src/pages/ParityPage.tsx`
- `src/pages/DocumentsPage.tsx`

### 1.4 Lógicas duplicadas a eliminar
- Cálculo de commodity/paridade distribuído entre stepper e página de paridade.
- Regras de documentos hardcoded fora do fluxo único de operação.

---

## 2) Arquitetura alvo (após remoção)

## 2.1 Único fluxo de operação
- `OperationStepperPage` como ponto único de entrada:
  1. Contexto
  2. Pedido
  3. Simulação
  4. Pagamento
  5. Subfluxo Barter (condicional)
  6. Formalização
  7. Resumo

## 2.2 Barter como plugin
- Barter só aparece se `payment_mode = barter`.
- Subetapas internas do plugin:
  - Condições commodity
  - Paridade
  - Contraparte
  - Documentos barter

## 2.3 Backend único de cálculo
- Cálculo centralizado server-side (Edge Function) para evitar divergência de frontend.
- Frontend apenas envia payload e renderiza ledger/snapshot retornado.

---

## 3) Plano de execução (1 plano, 6 fases)

## Fase A — Congelamento de legacy (sem quebra)
- Remover botões/links de menu para rotas legacy.
- Manter rotas com redirecionamento para `/operacao/novo`.
- Adicionar aviso de descontinuação quando usuário cair por URL antiga.

**DoD**: usuário novo não entra mais em telas legacy via navegação principal.

## Fase B — Unificação de simulação
- Migrar tudo de `SimulationPage` para hooks do Stepper:
  - `useOrderWizardState`
  - `useOrderCalculations`
  - `useOrderPersistence`
- Redirecionar `/simulacao` para stepper com query params de contexto.

**DoD**: nenhum cálculo/ação depende de `SimulationPage`.

## Fase C — Unificação de paridade
- Migrar toda lógica de `ParityPage` para subetapa Barter do Stepper.
- Remover persistência separada de paridade fora da operação.
- Redirecionar `/paridade` para stepper já no subfluxo barter.

**DoD**: paridade só existe dentro da operação ativa.

## Fase D — Unificação documental
- Migrar ações de emissão/assinatura/validação para o módulo de formalização do Stepper.
- Redirecionar `/documentos` para a etapa Formalização da operação.

**DoD**: documentos só são manipulados no contexto de uma operação específica.

## Fase E — Limpeza de código
- Excluir páginas legadas e imports em `App.tsx`.
- Remover entradas legacy do `AppSidebar`.
- Remover textos/badges "Legacy".
- Atualizar testes, snapshots e docs de navegação.

**DoD**: build sem referências a componentes/rotas legacy.

## Fase F — Hard cutover
- Substituir redirecionamentos por 410/404 amigável para rotas antigas após janela de transição.
- Publicar changelog de descontinuação.

**DoD**: base limpa, sem fallback para legado.

---

## 4) Checklist técnico por arquivo

## 4.1 Roteamento
- `src/App.tsx`
  - remover imports de páginas legacy
  - remover rotas legacy
  - incluir redirects temporários (durante transição)

## 4.2 Navegação
- `src/components/AppSidebar.tsx`
  - remover itens de menu legacy

## 4.3 Fluxo principal
- `src/pages/OperationStepperPage.tsx`
  - incorporar subfluxo barter completo
  - consolidar ações documentais

## 4.4 Páginas a remover
- `src/pages/SimulationPage.tsx`
- `src/pages/ParityPage.tsx`
- `src/pages/DocumentsPage.tsx`

## 4.5 Hooks/engines
- mover qualquer cálculo restante de telas legadas para hooks/engines compartilhados
- garantir uso de snapshot e logs em todo avanço

---

## 5) Riscos e mitigação

- **Risco**: usuários com favoritos para rotas antigas.
  - Mitigação: redirect + banner de migração por período definido.

- **Risco**: divergência de cálculo durante transição.
  - Mitigação: cortar cálculos duplicados e manter somente engine server-side.

- **Risco**: quebra de operação em andamento.
  - Mitigação: feature flag de cutover por campanha/tenant.

---

## 6) Critérios de aceite finais

1. Não existe navegação para telas com label "Legacy".
2. Simulação, paridade e documentos existem apenas no fluxo único de operação.
3. Todos os cálculos críticos retornam de backend com snapshot/ledger.
4. Rotas antigas descontinuadas com estratégia de transição concluída.
5. Monitoramento pós-cutover sem erro crítico por 2 ciclos de faturamento.

---

## 7) Sequência recomendada de PRs

1. **PR-1**: ocultar menus legacy + redirects temporários
2. **PR-2**: migrar simulação para stepper
3. **PR-3**: migrar paridade para subfluxo barter no stepper
4. **PR-4**: migrar documentos para formalização no stepper
5. **PR-5**: remover arquivos/rotas legadas e limpar código
6. **PR-6**: hard cutover + changelog + atualização operacional

