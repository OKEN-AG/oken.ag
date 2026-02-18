# Diagnostico e Plano: Conectar Admin e Operacao

## O Problema

O sistema tem dois mundos completamente desconectados:

1. **Mundo Admin** (parcialmente vivo): A tela `/admin/campanhas/:id` salva dados no banco, mas as abas Produtos, Combos e Commodities sao placeholders vazios com "Disponivel apos implementacao do Modulo X".
2. **Mundo Operacional** (100% estatico): Todas as 5 telas operacionais (Dashboard, Campanha, Simulacao, Paridade, Documentos, Monitoramento) leem exclusivamente de `mock-data.ts` com dados hardcoded. Nenhuma delas consulta o banco.

O resultado: o administrador configura campanhas reais no banco, mas o operador nunca ve esses dados. As duas jornadas nao se comunicam.

## A Jornada Correta

```text
ADMINISTRADOR                          OPERADOR
    |                                      |
    v                                      v
Cria Campanha (Geral, Financeiro,    Abre Simulacao
Elegibilidade, Modulos)                    |
    |                                      v
    v                                 Seleciona Campanha ativa (dropdown)
Cadastra Produtos (aba Produtos)           |
    |                                      v
    v                                 Ve produtos da campanha (do banco)
Configura Combos (aba Combos)              |
    |                                      v
    v                                 Monta pedido, combos aplicam automaticamente
Configura Commodities (aba)                |
    |                                      v
    v                                 Escolhe pagamento -> Barter -> Paridade
Publica campanha (ativa = true)            |
                                           v
                                      Salva operacao no banco
                                           |
                                           v
                                      Dashboard mostra dados reais
```

## Plano de Implementacao

### Etapa 1: Ativar abas internas da Campanha (Admin)

As abas "Produtos", "Combos" e "Commodities" dentro do formulario de campanha (`CampaignFormPage`) estao desabilitadas. Vamos ativa-las:

**Aba Produtos (dentro da campanha):**

- Criar componente `ProductsTab` que lista/adiciona/edita produtos vinculados a campanha
- Formulario inline com: nome, categoria, ingrediente ativo, tipo unidade, tamanhos de embalagem, unidades/caixa, caixas/palet, dose recomendada/min/max, preco unitario, moeda, tipo preco, inclui margem
- Hook `useProducts` com React Query buscando da tabela `products`
- Necessario criar tabela de vinculo `campaign_products` (ou usar products com campaign_id) para vincular produtos a campanhas especificas

**Aba Combos (dentro da campanha):**

- Criar componente `CombosTab` com listagem de combos da campanha
- Formulario: nome do combo, desconto %, adicionar/remover produtos com dose min/max
- Hook `useCombos` e `useComboProducts` lendo das tabelas `combos` e `combo_products`
- Calculo automatico de prioridade baseado no desconto medio ponderado
- Modelos de gatilhos de desconto: volume minimo, tamanho de area, cashback por pagamento

**Aba Commodities (dentro da campanha):**

- Criar componente `CommoditiesTab` com configuracao de precificacao
- Campos: bolsa, contrato, preco, custo opcao, cambios, basis por porto, deltas de seguranca, stop loss, volatilidade
- Sub-secao de Fretes: tabela editavel de redutores (origem, destino, distancia, custo/km, ajuste)
- Hooks `useCommodityPricing` e `useFreightReducers`

**Migracao de banco necessaria:**

- Criar tabela `campaign_products` para vincular produtos a campanhas (a tabela `products` existe mas nao tem `campaign_id`)
- Adicionar RLS permissiva para as novas tabelas

### Etapa 2: Conectar paginas operacionais ao banco

**SimulationPage:**

- Substituir `mockProducts`, `mockCampaign`, `mockCombos` por queries ao banco
- Adicionar dropdown de campanha ativa no topo da pagina
- Ao selecionar campanha, carregar: parametros financeiros, produtos vinculados, combos
- Os engines (`agronomic`, `combo-cascade`, `pricing`) continuam funcionando igual, apenas recebem dados reais em vez de mock

**CampaignPage (visao do operador):**

- Substituir `mockCampaign` e `mockCombos` por dados reais da campanha selecionada
- Exibir parametros, elegibilidade, margens e modulos da campanha ativa

**ParityPage:**

- Substituir `mockCommodityPricing` e `mockFreightReducers` por dados reais do banco
- Receber `campaign_id` para buscar commodity pricing e fretes da campanha

**Dashboard:**

- Substituir dados mock por queries reais a tabela `operations`
- Contagem de operacoes, volume total, sacas comprometidas
- Listagem de operacoes recentes

**DocumentsPage e MonitoringPage:**

- Conectar a operacoes reais do banco
- Manter estrutura visual, trocar fonte de dados

### Etapa 3: Fluxo de salvamento de operacoes

- Ao finalizar simulacao, botao "Salvar como Operacao" cria registro em `operations` com status `simulacao`
- Progresso para selecao de pagamento, depois para paridade barter
- Cada etapa atualiza a operacao no banco e gera log em `operation_logs`
- Dashboard reflete operacoes reais

Etapa 4: excluir abas de administração que estão fora de campanha , uma vez que já estão dentro da campanha

## Detalhes Tecnicos

### Migracao de banco

- Criar tabela `campaign_products` (campaign_id, product_id, com RLS permissiva)
- Isso permite que o mesmo produto esteja em multiplas campanhas

### Novos hooks

- `useProducts()` - lista todos os produtos
- `useCampaignProducts(campaignId)` - produtos vinculados a uma campanha
- `useCombos(campaignId)` - combos de uma campanha com seus produtos
- `useCommodityPricing(campaignId)` - precificacao de commodity
- `useFreightReducers(campaignId)` - redutores de frete
- `useOperations()` - operacoes do usuario

### Novos componentes

- `src/components/campaign/ProductsTab.tsx`
- `src/components/campaign/CombosTab.tsx`
- `src/components/campaign/CommoditiesTab.tsx`

### Arquivo mock-data.ts

Sera mantido temporariamente como fallback para telas ainda nao conectadas, mas progressivamente eliminado a cada etapa.

### Ordem de execucao

Dado o tamanho, sera implementado em 4 mensagens:

1. **Mensagem 1**: Etapa 1 (ativar abas admin - Produtos, Combos, Commodities)
2. **Mensagem 2**: Etapa 2 (conectar SimulationPage, CampaignPage, ParityPage ao banco)
3. **Mensagem 3**: Etapa 3 (fluxo de operacoes, Dashboard e Documentos vivos)
4. Mensagem 4: Etapa 4 ( reestruturação de abas e manutenção das funcionais)