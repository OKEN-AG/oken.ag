# Plano: Tornar o Sistema Vivo - Modulo por Modulo

## Problema

Todo o sistema atual e estatico. As 6 paginas leem dados de um arquivo `mock-data.ts` hardcoded. O banco de dados ja existe com as tabelas corretas mas nenhuma pagina se conecta a ele. Nao existe nenhuma tela de criacao ou edicao de dados.

## Estrategia

Vamos atacar modulo por modulo, para cada um: (1) criar tela de CRUD admin e (2) conectar a tela operacional ao banco de dados real. Cada modulo sera entregue em uma mensagem para manter o escopo gerenciavel.

---

## Modulo 1: Campanha (Fundacao)

**CRUD Admin:**

- Tela de listagem de campanhas com botao "Nova Campanha"
- Formulario de criacao/edicao com todos os campos, separados em abas especificas para cada topico abaixo:
  - Nome Campanha, Commodities, safra, Publico Alvo, target,
  - Moeda da campanha, Meios de Pagamento, Cambio de Conversao produtos, 
  - Juros,  Prazos de pagamento, Datas de Vencimento Unico, Desconto Geral para Lista, Desconto Máximo para Time Comercial Interno , Desconto Máximo para Time Comercial Distribuição
  - Elegibilidade: Seleção de Municipios elegíveis do Brasil a partir da seleção das Regiões, Estados, Mesorregioes, Municio, segmentos
- Criação de segmentos com campo livre com seleção de qual segmento será alvo e campo de Incremento ou Desconto % sobre lista para o Segmento. 
- Botao ativar/desativar campanha

**Conexao ao banco:**

- Hook `useCampaigns` com React Query para listar/criar/atualizar
- Hook `useChannelMargins` para margens vinculadas a campanha
- Remover import de `mockCampaign` em CampaignPage e SimulationPage

**Rota:** `/admin/campanhas` (listagem) e `/admin/campanhas/:id` (edicao)

---

## Modulo 2: Produtos (Catalogo)

**CRUD Admin:**

- Tela de listagem de produtos com filtro por categoria
- Formulario de criacao/edicao:
  - Nome, categoria, ingrediente ativo, Referencia para Desconto ( Mesmos produtos com diferentes embalagens deve ter o mesmo nome mãe) 
  - Tipo unidade (kg/l), Tamanhos(kg/l) de embalagem
  - Unidades/caixa, caixas/palet, palets/caminhao
  - Dose recomendada, min, max por hectare
  - Preco unitario, moeda, tipo preco, inclui margem

**Conexao ao banco:**

- Hook `useProducts` com React Query
- SimulationPage busca produtos do banco em vez de `mockProducts`

**Rota:** `/admin/produtos`

---

## Modulo 3: Combos (Cascata de Descontos)

**CRUD Admin:**

- Tela de Criação de combos para campanha
- Formulario: incluir item por Referencia para desconto, desconto %, dose min e dose max no no combo
- Adicionar/remover produtos no combo dinamicamente
- Visualizacao da ordem de prioridade (cascata) automaticamente estabelecida com base no desconto médio ponderado ao valor total da oferta para 1 ha tratado. Sistema deve multiplicar dose minima pelo preço da lista para cada produto, estabelecer o monante com desconto , comparar com a mesma conta mas sem desconto e ver qual o total ponderado de desconto para cada oferta e assim organizar  as prioridades de forma decrescente ( maior desconto primeiro )

**Conexao ao banco:**

- Hook `useCombos` e `useComboProducts` com React Query
- SimulationPage busca combos do banco

**Rota:** `/admin/combos`

---

## Modulo 4: Commodities e Fretes (Precificacao)

**CRUD Admin:**

- Tela de configuracao de commodity por campanha:
  - Bolsa, contrato, preco, custo opcao
  - Cambios Moedas
  - Premio de OpçÕes ( seguro
  - Basis por porto (formulario dinamico para add/remover portos) ou Mercado Formador de Preço
  - Deltas de seguranca, stop loss, volatilidade por contrato
- Tela de redutores de frete:
  - Listagem editavel com origem, destino, distancia, custo/km, ajuste

**Conexao ao banco:**

- Hooks `useCommodityPricing` e `useFreightReducers`
- ParityPage busca dados reais

**Rota:** `/admin/commodities` e `/admin/fretes`

---

## Modulo 5: Simulacao e Operacoes Conectadas

**Ajustes na SimulationPage:**

- Seletor de campanha ativa no topo (dropdown de lista elegível ao usuário)
- Informação de Area a ser tratada
- Seleção de produtos do portifolio ( em dose / ha ou diretamente em quantidade)
- Acompanhamento de progresso entre desconto obtido e máximo possível ( barra )
- Produtos, combos e parametros vem do banco
- Ao finalizar simulacao, salvar como `operation` no banco com status `simulacao`
- Aba ao salvar simulação deve-se progredir para meio de pagamento onde aparece opções de condição a vista, a prazo (para cada data de vencimento possível) e Opção de Barter
- Clicando na opção de barter deve -se ir para tela de paridade aonde é formada a paridade. Para isso, precisamos de dados da commodity  para formação de preço indicativo com parametros de commodity. O preço pode ser sobreposto pelo usuário. A paridade será uma divisão simples entre  montante com descontos, incluindo eventual desconto especifico para barter e o preço do campo de preço que pode ser o indicativo calculado ou informado pelo usuário. Tambem deve-se mostrar a quantidade de commodity para a conte sem desconto e comparar a diferença de quantidade entre uma e outra. tambem deve ser formado o preço equivalente do barter onde o montante sem deseconto é dividido pelo quantidade de sacas final ( com desconto) e um preço valorizado aparecerá . Deve mostrar a % da valorização equivalente ao preço original e a diferença nominal de preço. 
- Gerar log no `operation_logs`

**Ajustes na ParityPage:**

- Receber operation_id via rota em vez de via state
- Buscar/salvar dados de paridade na operation
- Commodity pricing e fretes do banco

---

## Modulo 6: Documentos e Dashboard Vivos

**DocumentsPage:**

- Listar documentos reais da operation selecionada do banco
- Botoes de "Emitir" e "Marcar como Assinado"

**Dashboard:**

- Dados reais: contagem de operacoes, volume total, sacas comprometidas
- Listagem de operacoes recentes do banco
- TrainTrack conectado a operacao real

---

## Estrutura de Navegacao Atualizada

```text
Sidebar:
  - Dashboard (/)
  - Simulacao (/simulacao)
  - Paridade (/paridade/:operationId)
  - Documentos (/documentos/:operationId)
  - Monitoramento (/monitoramento)
  ---
  Administracao:
  - Campanhas (/admin/campanhas)
  - Produtos (/admin/produtos)
  - Combos (/admin/combos)
  - Commodities (/admin/commodities)
  - Fretes (/admin/fretes)
```

---

## Detalhes Tecnicos

### Hooks padrao (React Query)

Cada modulo tera hooks como:

```text
useQuery    -> listar dados
useMutation -> criar/atualizar/deletar
invalidateQueries -> atualizar lista apos mutacao
```

### Arquivo mock-data.ts

Sera mantido temporariamente como fallback mas progressivamente substituido. Ao final dos 6 modulos, sera removido completamente.

### Ordem de execucao sugerida

1. Modulo 1 - Campanha (e a base de todos os outros)
2. Modulo 2 - Produtos
3. Modulo 3 - Combos
4. Modulo 4 - Commodities e Fretes
5. Modulo 5 - Simulacao conectada
6. Modulo 6 - Documentos e Dashboard

Cada modulo sera entregue em uma mensagem separada para manter qualidade e permitir testes incrementais.