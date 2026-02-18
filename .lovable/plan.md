# Diagnostico e Plano: Conectar Admin e Operacao

## Status: Etapas 1-4 Implementadas ✅

### Etapa 1 ✅ - Abas admin ativas (Produtos, Combos, Commodities)
### Etapa 2 ✅ - Páginas operacionais conectadas ao banco
### Etapa 3 ✅ - Fluxo de operações com salvamento no banco
### Etapa 4 ✅ - Sidebar reestruturado (removidas abas duplicadas)

## Resumo das mudanças

- SimulationPage: dropdown de campanha ativa, produtos/combos do banco, botão "Salvar Operação"
- ParityPage: usa commodity_pricing e freight_reducers da campanha, botão "Salvar Paridade"
- CampaignPage: dropdown de campanha, exibe dados reais (parâmetros, elegibilidade, margens, combos, produtos)
- Dashboard: queries reais à tabela operations (volume, sacas, operações recentes)
- DocumentsPage: conectada a operações reais com seletor
- MonitoringPage: filtra operações em fase de monitoramento do banco
- Sidebar: removidas rotas admin standalone (Produtos, Combos, Commodities, Fretes) — tudo centralizado dentro da campanha
- Hooks: useOperations, useActiveCampaign (com mapeamento DB→Engine types)
