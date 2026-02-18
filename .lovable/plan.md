

# Plano: Logistica por Cidade com Base CONAB de Armazens

## Contexto

Os arquivos XLS enviados sao da base CONAB/SICARM (Sistema de Cadastro Nacional de Unidades Armazenadoras) contendo armazens de 9 estados (GO, MT, MS, BA, MG, MA, PA, PB, DF). Cada arquivo tem as colunas: CDA, Armazenador, Endereco, Municipio, UF, Telefone, E-mail, Tipo, CAP.(t), Latitude, Longitude.

A tabela `campaign_delivery_locations` ja possui a estrutura compativel (cda, warehouse_name, address, city, state, phone, email, location_type, capacity_tons, latitude, longitude).

## O que muda

### 1. Importacao dos XLS CONAB

- Criar uma funcionalidade de importacao em massa na aba "Locais de Entrega" do CommoditiesTab
- Parsear os XLS usando a biblioteca `xlsx` ja instalada no projeto
- Mapear colunas CONAB para colunas do banco:
  - CDA -> cda
  - Armazenador -> warehouse_name
  - Endereco -> address
  - Municipio -> city
  - UF -> state
  - Telefone -> phone
  - E-mail -> email
  - Tipo -> location_type
  - CAP.(t) -> capacity_tons (converter string com ponto de milhar)
  - Latitude -> latitude
  - Longitude -> longitude
- Importar vinculado ao campaign_id ativo
- Evitar duplicatas por CDA dentro da mesma campanha

### 2. Fluxo de Logistica por Cidade na ParityPage

Alterar o componente `ParityInputs` para seguir a hierarquia:

```text
Estado (UF) -> Cidade (Municipio) -> Armazem
```

Em vez de listar todos os armazens num unico dropdown:
- Primeiro select: UF (extraido dos locais de entrega cadastrados)
- Segundo select: Cidade (filtrada pela UF selecionada)
- Terceiro select: Armazem (filtrado pela cidade selecionada, mostrando nome + capacidade)

Ao selecionar o armazem, as coordenadas (latitude/longitude) sao usadas automaticamente para calcular a distancia ao porto selecionado.

### 3. Calculo automatico de distancia ao selecionar armazem

Quando o usuario seleciona um armazem, o sistema automaticamente:
- Pega latitude/longitude do armazem
- Pega coordenadas do porto selecionado
- Chama a edge function `realtime-pricing/calculate-distance`
- Atualiza o redutor logistico com a distancia calculada

---

## Detalhes Tecnicos

### Arquivos modificados

1. **`src/components/campaign/CommoditiesTab.tsx`**
   - Melhorar o parser de importacao XLS para reconhecer o formato CONAB automaticamente (detectar colunas CDA, Armazenador, etc.)
   - Tratar a conversao de capacidade (ex: "3.580" com ponto de milhar -> 3580 numerico)

2. **`src/components/parity/ParityInputs.tsx`**
   - Adicionar states `selectedState` e `selectedCity`
   - Extrair lista unica de UFs dos `deliveryLocations`
   - Filtrar cidades pela UF selecionada
   - Filtrar armazens pela cidade selecionada
   - Disparar calculo de distancia automaticamente ao selecionar armazem (sem botao manual)

3. **`src/pages/ParityPage.tsx`**
   - Passar novos props de estado/cidade para ParityInputs
   - Disparar `handleCalculateDistance` automaticamente via useEffect quando armazem muda

### Tratamento de dados

- Capacidade: remover separador de milhar antes de converter (ex: "40.930" -> 40930)
- Latitude/Longitude: ja vem como numeros negativos no formato correto
- Encoding: os XLS tem encoding latin1, a lib xlsx ja lida com isso
- CDA: usado como identificador unico para evitar duplicatas na importacao

### UX da importacao

- Botao "Importar Base CONAB" na aba Locais de Entrega
- Aceita multiplos arquivos XLS simultaneamente
- Mostra preview com contagem antes de confirmar
- Ignora duplicatas (mesmo CDA + mesma campanha)
- Toast com resultado: "X armazens importados, Y duplicatas ignoradas"

