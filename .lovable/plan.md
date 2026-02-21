# Plano de Convergencia -- Documentacao Agrotoken para BarterPro

## O que foi extraido (sem blockchain/tokenizacao)

Dos 4 documentos, filtrei os conceitos que agregam ao sistema de barter sem qualquer dependencia de blockchain, tokens ou NFTs. Os documentos trazem frameworks robustos em 6 areas que o BarterPro ainda nao implementa completamente.

---

## CONCEITOS APROVEITAVEIS  
C ONE: 1) O que os documentos novos adicionam (sem blockchain)

### 1.1 Separar “existência”, “liquidez” e “entrega” como estados auditáveis

O documento v1 define claramente:

- **E(PoE)**: prova/esperança de existência (capacidade de produzir / já existe mas não entregue)
- **E(PoL)**: prova/esperança de liquidez (contrato que garante comprador e condição de pagamento)
- **PoD**: comprovante de entrega (transforma expectativa em fato)
- Tipos de preço do contrato: **PF (fixo)** vs **PAF (a fixar)**
- E um **índice de desempenho (IP)** entre t0 e td para medir “probabilidade/aderência” da entrega
  Tokenização de grãos futuros

👉 **Sem token**, isso vira um **“Pacote de Garantia”** (Collateral Package) ligado à operação, com status, evidências e cálculo de cobertura/LTV.

### 1.2 “Módulo Oráculo” (Comprador) e contrato com componentes de preço

O documento v2 detalha o **Comprador de Grãos (oráculo)** com **gestão de contratos**, tipo (PF/PAF), origem/destino/distância e **componentes do preço** (mercado, basis, frete, impostos) e preenchimento automático quando parte do preço vier do “PPA”/referência

Produto Futuro - Agrotoken *11*…

👉 No BarterAG, isso vira:

- cadastro/portal de compradores
- cadastro e validação de CCV
- “aceite” de cessão/anuência e confirmação de pagamento/entrega

### 1.3 Exigências jurídicas que viram “gates” do Orchestrator

O memorando jurídico (Grão em Produção) deixa muito claro o racional operacional:

- o “ativo” econômico é o **direito creditório do produtor no CCV**, suportado por **CPR como prova de existência**
- a **cessão do CCV** precisa ser **efetiva**: envolve **notificação ao comprador e/ou assinatura tripartite**, dependendo do CCV, antes de contar como “prova forte”
  Agrotoken - Memorando - Grão F…

👉 No BarterAG, isso vira:

- “Cessão criada” ≠ “Cessão válida”
- faturamento/liberação só após gates mínimos (como você descreveu no “trem” de vagões e certificações)
  Prompt sistema de barter

---

## 2) Plano de aprimoramento (incremental, sem duplicar e sem ponta solta)

### EPIC A — Reestruturar a jornada de Operação (UI + State Machine) com o Orchestrator

**Objetivo:** transformar “Operações” num fluxo guiado e auditável: rascunho → simulação → formalização → liberação → monitoramento → liquidação.

**Entregas**

1. Criar **State Machine** única do pedido/operação (em tabela `operation_status_history` + status atual no `operations`)
2. Toda etapa gera **checklist** e **bloqueios objetivos** (sem depender de “conhecimento do operador”).
3. “Snapshot” imutável no momento da confirmação (pricing_snapshot, eligibility_snapshot etc.) para auditoria
  Catalogo componentes e variaveis

**Por quê agora:** isso é o que conecta Admin (campanhas/commodities prontas) com Operação, sem retrabalho.

---

### EPIC B — Portal de Contrapartes: Comprador/Oráculo e Provedor de Liquidez

**Objetivo:** trazer para dentro do sistema os atores que “validam” e “dão liquidez”, sem blockchain.

**B1) Comprador/Oráculo (PJ)**

- Tela: **Oráculo > Contratos (CCV)**
- Campos mínimos por contrato:
  - tipo: **PF/PAF** (já bate com sua configuração de commodities)
    Catalogo componentes e variaveis
  - origem/destino/distância
  - componentes de preço fixados (mercado/basis/frete/impostos) e valor estimado (se aplicável)
    Produto Futuro - Agrotoken *11*…
- Ações do comprador:
  - **validar/aceitar cessão**
  - confirmar “pagamento previsto” e “pagamento realizado” (na liquidação)
  - upload de documentos/aceites

**B2) Provedor de Liquidez (banco/investidor/revenda)**

- Tela: **Liquidez > Propostas / Colaterais Disponíveis**
- Ações:
  - aprovar recebimento de garantia (colateral package)
  - aprovar condições (LTV, haircuts, covenants)
  - solicitar execução em caso de evento

**Obs.:** o memorando descreve fluxos com comerciante e provedor financeiro; no BarterAG isso vira “papéis e permissões” + trilha auditável do que foi aceito/transferido/liquidado

Agrotoken - Memorando - Grão F…

---

### EPIC C — “Pacote de Garantia” (Collateral Package) substituindo token por registro interno

**Objetivo:** implementar o que a tokenização organizava, mas como **registro interno com evidência e estado**.

**Modelo**

- `collateral_packages`
  - `poe_type` (grão existente / grão em produção/CPR)
  - `pol_type` (CCV PF / CCV PAF / outro)
  - `delivery_due_date (td)`
  - `quantity_ton / equivalent_sacks`
  - `ip_index` (0..1) + lógica de atualização
  - status: `draft → pending_docs → pending_cession_acceptance → eligible → delivered → settled / default`

**Evidências (subtabela)**

- `collateral_evidences`
  - tipo: PoE / PoL / PoD
  - arquivo + metadados extraídos (campos chave do CCV/CPR)
  - “assinatura/aceite” (quem aceitou, quando)

**Justificativa:** isso implementa E(PoE), E(PoL), PoD e IP como primeiro-classe no sistema

Tokenização de grãos futuros

---

### EPIC D — Engine de Documentos e Cessão: do “gerar” ao “válido”

**Objetivo:** transformar Document Engine em **gerador + workflow de validação** (não só PDF).

**D1) Templates mínimos**

- Pedido
- Termo de Barter / Termo de Compromisso
- CCV (quando comprador está “na plataforma”)
- Cessão do CCV
- Notificação ao comprador (quando exigida) / opção de tripartite
- CPR (quando aplicável)
  Prompt sistema de barter

**D2) Regras de gate (Orchestrator)**

- “Cessão criada” só libera avanço quando:
  - comprador **foi notificado** e/ou **assinou tripartite**, conforme regra do CCV (registrar qual caminho foi usado)
    Agrotoken - Memorando - Grão F…
- “Faturamento/liberação” só ocorre com checklist mínimo aprovado (seu conceito do trem/vagões)
  Prompt sistema de barter

---

### EPIC E — Ajustes nos Engines para refletir PF/PAF e “fixação”

Aqui não é “refazer commodities”; é **usar o que já existe** e ligar no fluxo.

**E1) Commodity Engine (Operação)**

- Se campanha permite **pré-existente / fixo no ato / a fixar**, a jornada deve abrir caminhos diferentes
  Catalogo componentes e variaveis
- Para **PAF**:
  - registrar referência de preço e regras de fixação
  - status “aguardando fixação”
- Para **PF**:
  - exigir preço/condição fixada e anexar evidência

**E2) Parity Engine**

- já está no seu blueprint: comparar **preço valorizado vs preço contrato** e permitir sobreposição
  Prompt sistema de barter
- melhoria nova: vincular essa comparação ao contrato PF/PAF e aos componentes fixados (mercado/basis/frete/impostos)
  Produto Futuro - Agrotoken *11*…

**E3) Guarantee Engine**

- calcular cobertura/haircut usando:
  - IP (entregabilidade)
  - tipo de PoL (PF tende a ter haircut menor que PAF)
  - travas por documentação (PoE/PoL/PoD)
    Tokenização de grãos futuros

---

### EPIC F — Monitoring e Settlement orientados a “entrega e compensação”

Você já tinha isso como Fase 6 (monitorar e liquidar)

Prompt sistema de barter

 — o que os docs novos adicionam é “o que monitorar”.

**F1) Monitoring Engine**

- saúde do colateral package:
  - PoEc (checkpoints) e atualização de IP
  - alertas: atraso de documentação, não aceite do comprador, janela de entrega, variação relevante de preço (se PAF)
    Tokenização de grãos futuros

**F2) Settlement Engine**

- registrar:
  - entrega (PoD)
  - pagamento do comprador
  - conciliação com provisões (margem/juros/custos barter) — alinhado ao seu desenho de “compensação e encerramento”
    Prompt sistema de barter

---

## 3) Mapeamento direto: “tokenização” → “BarterAG sem blockchain”

Pra você aproveitar tudo sem carregar o tema:

- **Token** → `collateral_package_id` (registro interno)
- **Wallet / transferência** → “titularidade do pacote” (owner_id + audit trail)
- **Mint/Burn** → “criar pacote” / “encerrar pacote após liquidação”
- **Oráculo** → portal do comprador: valida contrato, aceita cessão, confirma entrega/pagamento
  Produto Futuro - Agrotoken *11*…
- **Provas (PoE/PoL/PoD)** → evidências anexadas + status + regras de gate
  Tokenização de grãos futuros

---

## 4) Prompt que você cola no Lovable (completo, sem ambiguidade)

Use isso como “brief único” para não duplicar nada:

**Contexto fixo (não mexer):**

- “Campanhas e Commodities estão prontas; não reestruturar essas telas nem seus schemas, apenas consumir os dados.”
  Catalogo componentes e variaveis
- “Manter arquitetura por engines e routes no Supabase; implementar novas tabelas/edges apenas para Operações/Formalização/Contrapartes.”
  Prompt sistema de barter

**Entregas obrigatórias:**

1. Reescrever módulo **Operações** como **wizard com state machine** e snapshots auditáveis
  Catalogo componentes e variaveis
2. Criar **Portal Oráculo/Comprador** com gestão de contratos PF/PAF e aceite de cessão
  Produto Futuro - Agrotoken *11*…
3. Criar **Portal Provedor de Liquidez** para aprovar/receber garantias e acompanhar liquidação
  Agrotoken - Memorando - Grão F…
4. Criar **Collateral Package** (PoE/PoL/PoD + IP) e gates no Orchestrator
  Tokenização de grãos futuros
5. Document Engine com templates + workflow: CCV, Cessão, Notificação/Tripartite, CPR; e bloquear faturamento sem checklist mínimo
  Prompt sistema de barter

**Regras de negócio (sem interpretação):**

- PoL só vira “válido” quando houver aceite do comprador via notificação e/ou tripartite (registrar qual caminho)
  Agrotoken - Memorando - Grão F…
- PF vs PAF muda o fluxo e o risco (haircuts e monitoramento)
  Tokenização de grãos futuros
- Tudo deve gerar `event_log` e `status_history`.

### C2: Indice de Performance (IP) -- Saude da Producao

O documento define um IP (Performance Index) entre 0 e 1 que mede a probabilidade do grao ser entregue:

- IP = 0: colheita perdida
- IP = 1: entrega total confirmada
- Entre 0 e 1: risco proporcional

Formula: `b = a * IP` onde `a` = toneladas comprometidas e `b` = toneladas efetivamente esperadas.

**Aplicacao no BarterPro**: Integrar ao Monitoring Engine como indicador de saude da operacao. Pode ser alimentado manualmente (campo no stepper) ou derivado de dados externos (NDVI futuro). Afeta o valor de cobertura da garantia: `cobertura_efetiva = cobertura_base * IP`.

### C3: Indice de Variacao de Preco (IVP)

Para contratos com preco a fixar (PAF), o documento adiciona um multiplicador de risco de preco:

- IVP = 1: sem risco de preco (preco fixo)
- IVP < 1: risco de variacao proporcional

Formula: `MVC($) = b * (preco_futuro) * IVP`

**Aplicacao no BarterPro**: Quando o contrato do comprador e "a fixar" (nao tem preco fixo), o sistema deve aplicar um haircut proporcional a volatilidade. Ja temos volatilidade no commodity_pricing -- basta expor como flag de tipo de preco no contrato.

### C4: Aforo (Colateral Index / Overcollateralization)

O documento define um "aforo" -- percentual de sobrecolateralizacao exigido para seguranca:

- Ex: aforo de 120% significa que o cliente precisa entregar garantias equivalentes a 120% do valor da operacao

**Aplicacao no BarterPro**: Adicionar campo `aforo_percent` na campanha. O Guarantee Engine valida se `valor_garantias >= montante_operacao * aforo / 100`.

### C5: Cadastro Estruturado de Fazenda e Produtor (Onboarding)

Os documentos detalham um cadastro rico de produtor e fazenda:

- PF/PJ com validacao CPF/CNPJ
- Inscricao Estadual, CAR (Cadastro Ambiental Rural), Matricula do imovel
- Tipo de posse (proprietario, arrendatario, comodatario)
- Dados bancarios (PIX, banco, agencia, conta)
- Fazendas vinculadas com geolocalizacao

**Aplicacao no BarterPro**: Expandir o perfil do cliente no stepper e no banco. Hoje so temos nome/documento/cidade. Para operacoes reais, precisamos de endereco completo, dados fiscais (IE), dados bancarios e informacoes de propriedade.

### C6: Fluxo de Cessao de Credito Tripartite

O memorando juridico (Pinheiro Neto) detalha 4 modelos de operacao, todos convergem em:

1. Produtor + Comprador celebram CCV
2. Cessao dos direitos creditorios ao credor (Agrotoken/empresa de insumos)
3. Notificacao do comprador sobre a cessao
4. No vencimento: comprador paga ao cessionario, que liquida a operacao

**Aplicacao no BarterPro**: O Document Engine precisa registrar a cadeia de cessao com 3 partes (cedente/cessionario/devedor). Adicionar campo `counterparty_notified` e `cession_accepted` nos documentos de cessao.

---

## MUDANCAS PROPOSTAS (sem duplicar Admin)

### Fase 1: Tipos e Engine -- Framework PoE/PoL/IP

**1.1 Adicionar tipos em `src/types/barter.ts**`

```text
// Novos tipos para framework de garantias
GuaranteeCategory = 'poe' | 'pol' | 'pod'

// Campos adicionais em OperationDocument
guaranteeCategory?: GuaranteeCategory

// Novo tipo para Performance Index
PerformanceIndex = {
  operationId: string
  value: number       // 0..1
  source: 'manual' | 'ndvi' | 'seguro'
  updatedAt: string
  notes?: string
}

// Campos adicionais no snapshot
performanceIndex?: number
priceVariationIndex?: number  // IVP
aforoPercent?: number
```

**1.2 Atualizar Orchestrator Engine**

- Adicionar validacao PoE + PoL na transicao "garantido -> faturado"
- `canAdvance` verifica: existe pelo menos 1 documento com `guaranteeCategory = 'poe'` (CPR/silo) E pelo menos 1 com `guaranteeCategory = 'pol'` (CCV/contrato com comprador)
- Manter Orchestrator como unica autoridade de avanco (conforme instrucao)

**1.3 Criar Guarantee Validation Logic**

Adicionar ao engine de garantias:

```text
cobertura_base = sum(valor_garantias)
cobertura_efetiva = cobertura_base * IP
aforo_exigido = montante_operacao * (aforo_percent / 100)
garantia_ok = cobertura_efetiva >= aforo_exigido
```

### Fase 2: Banco de Dados -- Novos campos

**2.1 Migration: Adicionar campos a tabelas existentes**

- `campaigns`: `+ aforo_percent NUMERIC DEFAULT 130`, `+ contract_price_types TEXT[] DEFAULT '{fixo,a_fixar}'`
- `operation_documents`: `+ guarantee_category TEXT` (poe/pol/pod)
- `operations`: `+ performance_index NUMERIC DEFAULT 1`, `+ price_variation_index NUMERIC DEFAULT 1`, `+ aforo_percent NUMERIC DEFAULT 130`
- `profiles`: `+ inscricao_estadual TEXT`, `+ car_number TEXT`, `+ land_type TEXT`, `+ farm_name TEXT`, `+ farm_address TEXT`, `+ bank_name TEXT`, `+ bank_agency TEXT`, `+ bank_account TEXT`, `+ pix_key TEXT`

**2.2 Nova tabela: `operation_guarantees**`

Para rastrear cobertura por operacao:

```text
id, operation_id, document_id, category (poe/pol/pod), 
estimated_value, effective_value, ip_at_evaluation, 
status (pendente/validado/expirado), evaluated_at
```

### Fase 3: UI do Stepper -- Novos elementos

**3.1 Step de Contexto: Dados expandidos do cliente**

Adicionar campos:

- Inscricao Estadual
- Tipo de pessoa (PF/PJ) -- ja implementado no engine, expor na UI
- Telefone, e-mail (ja adicionado parcialmente)
- Dados bancarios (banco, agencia, conta, PIX) -- para futuro pagamento
- Nome da fazenda e CAR (quando disponivel)

**3.2 Step de Barter: Tipo de preco do contrato**

Quando o usuario informa um comprador:

- Adicionar select: "Tipo de preco" = Fixo | A fixar | Pre-existente
- Se "A fixar": aplicar IVP como haircut na paridade (ex: IVP = 0.95 se volatilidade alta)
- Se "Fixo": IVP = 1 (sem haircut)
- Se "Pre-existente": usuario informa preco e contraparte

**3.3 Step de Formalizacao: Checklist PoE/PoL**

Na tela de formalizacao, agrupar documentos por categoria:

```text
PROVA DE EXISTENCIA (PoE)
  [ ] CPR emitida e assinada
  [ ] Laudo de area produtiva (opcional)

PROVA DE LIQUIDEZ (PoL)  
  [ ] CCV com comprador
  [ ] Cessao de credito ao credor
  [ ] Notificacao do comprador

PROVA DE ENTREGA (PoD) -- pos-faturamento
  [ ] Romaneio de entrega
  [ ] Certificado de pesagem
```

**3.4 Painel de Garantias: Cobertura e IP**

Adicionar secao no step de Resumo ou novo step "Garantias":

- Barra de cobertura: `cobertura_efetiva / aforo_exigido`
- Campo de IP (0-100%) editavel pelo operador
- Calculo automatico: `sacas_efetivas = sacas_comprometidas * IP`
- Alerta se cobertura < aforo

### Fase 4: Snapshot -- Campos adicionais

Atualizar `buildSnapshot` para incluir:

- `performanceIndex`
- `priceVariationIndex`  
- `aforoPercent`
- `guaranteeCoverage`: { base, effective, required, sufficient }
- `contractPriceType`: 'fixo' | 'a_fixar' | 'pre_existente'
- `cessionChain`: { cedente, cessionario, devedor, notified, accepted }

---

## Arquivos Impactados


| Arquivo                              | Mudanca                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `src/types/barter.ts`                | + GuaranteeCategory, PerformanceIndex, campos PoE/PoL                                           |
| `src/engines/orchestrator.ts`        | + validacao PoE/PoL no canAdvance                                                               |
| `src/engines/parity.ts`              | + IVP haircut para contratos "a fixar"                                                          |
| `src/engines/snapshot.ts`            | + IP, IVP, aforo, cobertura no snapshot                                                         |
| `src/pages/OperationStepperPage.tsx` | + campos cliente, tipo preco contrato, checklist PoE/PoL, painel garantias                      |
| Migration SQL                        | + campos em campaigns, operations, operation_documents, profiles; + tabela operation_guarantees |


## O que NAO sera feito (blockchain/tokenizacao)

- NFT minting/burning
- Carteiras digitais (wallets)
- Smart contracts
- Exchange/DeFi
- Modulo de emprestimos
- Stacking
- Oracle de preco on-chain

Todos os conceitos economicos e de governanca foram extraidos sem nenhuma dependencia de infraestrutura blockchain.

---

## Ordem de Implementacao

1. Types (`barter.ts`) -- novos tipos
2. Migration SQL -- novos campos e tabela
3. Orchestrator -- validacao PoE/PoL
4. Parity -- IVP haircut
5. Snapshot -- novos campos
6. Stepper UI -- campos expandidos, checklist, painel garantias