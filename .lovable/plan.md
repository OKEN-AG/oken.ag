
# Review Completo de Coerencia - Todos os Problemas Identificados

## PROBLEMAS CRITICOS (Bloqueiam uso real)

### 1. useMemo usado para side effects (SimulationPage.tsx, linhas 37-46)
`useMemo` esta sendo usado para chamar `setState`, o que e um anti-pattern do React. Causa re-renders infinitos potenciais e comportamento imprevisivel.
- Linha 37-41: Auto-select campanha com `useMemo` + `setSelectedCampaignId`
- Linha 44-46: Reset produtos com `useMemo` + `setSelectedProducts`
- **Correcao**: Trocar ambos por `useEffect`

### 2. CampaignPage.tsx auto-select causa loop (linha 15-17)
```
if (!selectedId && campaigns && campaigns.length > 0) {
  setSelectedId(campaigns[0].id);
}
```
Chamada de `setState` diretamente no corpo do render (fora de useEffect). Causa re-render infinito no React strict mode.
- **Correcao**: Mover para `useEffect`

### 3. Dois botoes "Salvar" fazem a mesma coisa (SimulationPage.tsx, linhas 341-349)
Ambos chamam `handleSaveOperation` e ambos navegam para `/paridade`. O primeiro deveria salvar sem navegar.
- **Correcao**: Criar `handleSaveOnly` que salva sem navegar, e manter `handleSaveOperation` para o segundo botao

### 4. ParityPage nao funciona sem `location.state` (linha 26-29)
Acessar `/paridade` diretamente pelo menu mostra valores default (500000) sem vinculo a nenhuma operacao. Nao ha seletor de operacao ou campanha.
- **Correcao**: Adicionar seletor de campanha e opcionalmente operacao, similar ao SimulationPage

### 5. DocumentsPage usa modulos hardcoded (linha 46)
`activeModules` esta fixo como `['adesao', 'simulacao', 'formalizacao', 'documentos', 'garantias']` ao inves de buscar da campanha da operacao.
- **Correcao**: Buscar `active_modules` da campanha vinculada a operacao selecionada

### 6. Freight reducer sintetico nao funciona sem reducer manual (ParityPage.tsx, linha 68-74)
Quando `autoDistanceKm` existe mas `freightReducer` e `undefined` (nenhum reducer manual cadastrado), o calculo retorna `undefined`. A distancia calculada automaticamente e perdida.
- **Correcao**: Criar reducer sintetico com `costPerKm` default quando nao ha reducer manual

### 7. Label errada "R$/saca" no ParityInputs (linha 216)
`totalReducer` e R$/ton no engine, mas a label mostra "R$/saca".
- **Correcao**: Alterar para "R$/ton"

---

## PROBLEMAS DE LOGICA DE NEGOCIO

### 8. Gross-to-Net incompleto na SimulationPage (linhas 334-338)
Mostra apenas 4 itens: Receita Bruta, Desconto Combo, Receita Financeira, Total a Pagar. Faltam:
- Margem do Distribuidor (ja calculada no engine, campo `distributorMargin`)
- Desconto Barter (campo `barterDiscount`, sempre 0 na simulacao)
- Net Net Revenue (receita liquida apos margem)
- **Correcao**: Adicionar colunas para visibilidade completa

### 9. Prazo fixo em meses ao inves de datas de vencimento da campanha
SimulationPage oferece prazos fixos (6, 9, 12, 15 meses). A campanha tem tabela `campaign_due_dates` com datas por regiao mas nao sao usadas.
- **Correcao**: Buscar `campaign_due_dates` e `campaign_payment_methods` e popular os selects dinamicamente

### 10. Canal de venda nao usa segmentos da campanha
SimulationPage mostra opcoes fixas ("Distribuidor", "Cooperativa", "Venda Direta"). A campanha tem tabela `campaign_segments` com segmentos customizados e ajustes de preco.
- **Correcao**: Buscar `campaign_segments` e popular o select dinamicamente

### 11. Pricing engine nao usa `price_cash` / `price_term` dos produtos
A tabela `products` tem campos `price_cash` e `price_term` mas o engine so usa `price_per_unit`. O sistema deveria usar `price_cash` quando `priceType = 'vista'` e `price_term` quando ja tem preco a prazo.
- **Correcao**: Atualizar engine para considerar esses campos

### 12. Combo cascade usa REF mas matching pode falhar
O combo cascade faz matching por `ref.toUpperCase()`. Se um produto nao tem `ref` preenchido, o match falha silenciosamente. Nao ha indicacao visual de que o `ref` esta faltando.
- **Correcao**: Adicionar validacao visual na ProductsTab e fallback para `name` quando `ref` esta vazio

### 13. Insurance engine calculo incorreto
Linha 83 do ParityPage: `premiumPerSaca = premium * 16.667`. O calculo multiplica o premium por sacas/ton (16.667), mas o premium de Black-Scholes ja esta em BRL (spot em BRL). A multiplicacao nao faz sentido dimensional.
- **Correcao**: Revisar formula - o premium deve ser dividido pelo preco da saca, nao multiplicado por sacas/ton

---

## PROBLEMAS DE UI / UX

### 14. Dashboard operacoes nao sao clicaveis
As operacoes recentes tem `cursor-pointer` mas nao tem `onClick`. Clicar nao faz nada.
- **Correcao**: Adicionar navegacao ao clicar (para `/documentos` com o ID da operacao)

### 15. Campanha page e read-only sem necessidade
A pagina `/campanha` mostra dados da campanha em modo somente leitura. Nao ha botao para editar ou link para o formulario de edicao.
- **Correcao**: Adicionar botao "Editar" que navega para `/admin/campanhas/:id`

### 16. Nao ha selecao de campanha na ParityPage
Quando acessada diretamente pelo menu, nao ha como escolher uma campanha. Os dados ficam em mock/default.
- **Correcao**: Adicionar seletor similar ao SimulationPage

### 17. MonitoringPage sem funcionalidade real
A pagina mostra apenas cards estaticos sem acoes. Campos como "Cobertura de Garantia" mostram "---" permanentemente. Nao ha drill-down nas operacoes.
- **Correcao**: Adicionar indicadores calculados e links para detalhes

### 18. CampaignsListPage nao mostra codigo auto/custom
Lista mostra apenas nome, safra, target, formato. Faltam os codigos que sao gerados e customizados.
- **Correcao**: Adicionar display dos codigos

### 19. Formato de preco forcado na gravacao (CampaignFormPage linha 171)
`priceFormat` e calculado como `'brl_vista'` ou `'usd_vista'` baseado apenas na moeda, ignorando o `price_list_format` que o usuario pode ter configurado com margem ou prazo.
- **Correcao**: Usar o valor do form ao inves de sobrescrever

### 20. CommoditiesTab warning de ref no console
Console log mostra: "Function components cannot be given refs" causado por um `Select` sem `forwardRef` no CommoditiesTab.
- **Correcao**: Verificar e corrigir o componente que esta recebendo ref indevido

---

## PROBLEMAS DE DADOS / INTEGRACAO

### 21. Queries duplicadas para commodity_pricing
`useCampaignData` faz duas queries identicas: `commodityQuery` (linha 98) e `rawCommodityQuery` (linha 160), ambas consultando `commodity_pricing` para o mesmo `campaignId`.
- **Correcao**: Unificar em uma unica query e derivar ambos os formatos

### 22. Combos carregados com N+1 queries
`useCampaignData` faz uma query para cada combo para buscar seus produtos (loop `for` na linha 62). Com 20 combos, sao 21 queries.
- **Correcao**: Buscar todos `combo_products` de uma vez com `in` filter

### 23. `(supabase as any)` usado extensivamente
CampaignFormPage e CommoditiesTab usam `(supabase as any)` para acessar tabelas. Isso elimina type-safety e pode esconder erros.
- **Correcao**: Regenerar types do Supabase ou adicionar tipos manualmente

### 24. Operacoes nao salvam commodity selecionada
Ao salvar a operacao na SimulationPage, nao ha campo para selecionar qual commodity sera usada no barter. O campo `commodity` na tabela fica com default 'soja'.
- **Correcao**: Adicionar seletor de commodity na SimulationPage

### 25. Falta validacao de elegibilidade
A SimulationPage nao valida se o usuario/cidade/segmento selecionado e elegivel para a campanha. Qualquer combinacao e aceita.
- **Correcao**: Implementar check de elegibilidade no momento da selecao

---

## RESUMO POR PRIORIDADE

**Urgente (bugs ativos):**
1, 2, 3, 6, 7, 13, 20

**Importante (funcionalidade incompleta):**
4, 5, 8, 9, 10, 14, 16, 19

**Melhorias (coerencia e performance):**
11, 12, 15, 17, 18, 21, 22, 23, 24, 25

---

## Detalhes Tecnicos - Correcoes Prioritarias

### Arquivos a modificar:

1. **SimulationPage.tsx** - Corrigir useMemo (bug 1), separar botoes (bug 3), adicionar margem no G2N (bug 8), usar segmentos/datas dinamicos (bugs 9, 10)
2. **CampaignPage.tsx** - Corrigir auto-select (bug 2), adicionar botao editar (bug 15)
3. **ParityPage.tsx** - Adicionar seletor campanha (bug 4), criar reducer sintetico (bug 6), corrigir insurance (bug 13)
4. **ParityInputs.tsx** - Corrigir label R$/saca para R$/ton (bug 7)
5. **DocumentsPage.tsx** - Usar modulos da campanha (bug 5)
6. **Dashboard.tsx** - Tornar operacoes clicaveis (bug 14)
7. **CampaignFormPage.tsx** - Nao sobrescrever price_list_format (bug 19)
8. **useActiveCampaign.ts** - Unificar queries (bugs 21, 22)
