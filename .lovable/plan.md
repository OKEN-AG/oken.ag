# Plano: Correcoes de Design, Produtos como Workbook e Importacao de Combos

## Problema 1: Design - Texto sumindo no background

O tema CSS usa cores de `muted-foreground` e `card-foreground` que em modo claro podem conflitar com backgrounds assim como escuros . Especificamente:

- `--card-foreground: 26 90.4762% 37.0588%` (um marrom/laranja) mistura com backgrounds claros
- `--muted: 215 20% 65%` e `--muted-foreground: 222 47% 11%` precisam de contraste melhor
- Labels com `text-muted-foreground` sobre `bg-muted/30` ficam invisiveis

**Correcao**: Ajustar as variaveis CSS para garantir contraste adequado em ambos os modos, e adicionar `bg-background` explicito em areas de conteudo.

---

## Problema 2: Produtos como Workbook (estilo Excel)

A aba de Produtos atual (`ProductsTab.tsx`) usa um formulario modal separado para criar/editar. O usuario quer uma tabela editavel diretamente, estilo planilha.

### Novo schema do produto (campos faltantes vs tabela anexa)

A tabela `products` atual **nao possui** os campos: `code` (codigo do produto) e `ref` (referencia/nome mae para desconto), nem `price_cash` (preco a vista) vs `price_term` (preco prazo) separados. Atualmente so tem `price_per_unit`.

**Migracao necessaria**: Adicionar a tabela `products`:

- `code` (text) - Codigo do produto (ex: 5696797)
- `ref` (text) - Referencia/nome mae para desconto (ex: ATEN, BELT, FOX)
- `price_cash` (numeric) - Preco Ponta Cash
- `price_term` (numeric) - Preco Prazo

### Nova interface ProductsTab

Substituir o formulario atual por uma tabela editavel inline com as colunas:

- `#` (indice)
- `CODIGO` (editavel)
- `PRODUTO` (nome, editavel)
- `REF` (referencia, editavel)
- `PRECO PONTA CASH` (editavel)
- `PRECO PRAZO` (editavel)
- `CAIXA` (units_per_box, editavel)
- `KG/L` (package size, editavel)
- Acoes: excluir, desvincular

Cada celula sera clicavel para edicao direta (click para editar, Enter/Tab para confirmar, Escape para cancelar).

### Importacao

Botoes de importacao no topo:

- **CSV/XLS**: Upload de arquivo com as colunas na ordem do template
- **Colar Texto**: Textarea para colar dados tabulados (separados por tab/;/,)

O parser reconhece o formato: `CODIGO PRODUTO REF PRECO_CASH PRECO_PRAZO CAIXA KG_L`

---

## Problema 3: Combos - Importacao de Matriz de Desconto

A aba de Combos (`CombosTab.tsx`) nao suporta importacao. Os combos sao chamados "OFERTA 1", "OFERTA 2", etc, com produtos identificados pelo campo `REF` (nome mae).

### Fluxo de importacao

Adicionar botao "Importar Matriz" no `CombosTab` que:

1. Aceita CSV, XLS ou texto colado
2. Parseia o formato da matriz de desconto:
  - Linhas com `OFERTA X` ou `COMPLEMENTARES` criam um novo combo
  - Cada linha subsequente com `# REF DESCONTO DOSE_MIN DOSE_MAX` adiciona produto ao combo
  - O `REF` e usado para buscar o produto pelo campo `ref` na tabela `products`
3. Cria os combos automaticamente no banco com os respectivos produtos vinculados

### Parser da matriz

O parser identifica:

- Linhas contendo "OFERTA" ou "COMPLEMENTARES" como delimitadores de grupo
- Linhas com dados numericos como items do combo
- Desconto em `%` e convertido para numero
- Dose minima e maxima sao mapeadas para `min_dose_per_ha` e `max_dose_per_ha`

---

## Detalhes Tecnicos

### Migracao SQL

```text
ALTER TABLE products ADD COLUMN IF NOT EXISTS code text DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS ref text DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_cash numeric DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_term numeric DEFAULT 0;
```

### Arquivos modificados

1. `**src/index.css**`: Corrigir variaveis de cor para contraste
2. `**supabase/migrations/...**`: Adicionar colunas `code`, `ref`, `price_cash`, `price_term` na tabela `products`
3. `**src/components/campaign/ProductsTab.tsx**`: Reescrever como tabela editavel estilo workbook com importacao CSV/XLS/texto
4. `**src/components/campaign/CombosTab.tsx**`: Adicionar importacao de matriz de desconto com parser inteligente que busca produtos por REF
5. `**src/hooks/useProducts.ts**`: Ajustar mutations para os novos campos
6. `**src/pages/ParityPage.tsx**`: Corrigir warning de ref no componente `Row`

### Fluxo do Workbook de Produtos

```text
Usuario abre aba Produtos
  |
  v
Tabela editavel com todos os produtos vinculados
  |
  +--> Clica em celula -> campo vira Input editavel
  +--> Enter/Tab -> salva automaticamente no banco
  +--> Escape -> cancela edicao
  |
  v
Botoes no topo:
  [+ Linha] [Importar CSV/XLS] [Colar Texto]
  |
  +--> Importar: parseia arquivo, cria produtos e vincula
  +--> Colar: textarea modal, parseia linhas tabuladas
```

### Fluxo de Importacao de Combos

```text
Usuario abre aba Combos -> [Importar Matriz]
  |
  v
Modal com opcoes: [Upload CSV/XLS] [Colar Texto]
  |
  v
Parser identifica blocos OFERTA/COMPLEMENTARES
  |
  v
Para cada bloco:
  1. Cria combo com nome e desconto
  2. Busca produtos pelo REF
  3. Vincula com dose min/max
  |
  v
Combos criados no banco, lista atualizada
```