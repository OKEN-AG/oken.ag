# Diagramas — Arquitetura e Fluxo do Sistema

Este documento traduz a arquitetura descrita em `docs/ARCHITECTURE_BARTEPRO_UNIFICADA_20_ONDAS.md` para dois diagramas: **arquitetura** (visão estrutural) e **fluxo** (visão de execução/jornada).

## 1) Diagrama de Arquitetura (System of Systems)

```mermaid
flowchart LR
  subgraph Canais["Canais"]
    UI["Frontend\n(Order Wizard / Stepper)"]
    ADM["Admin\n(Campanhas, Produtos, Combos, Commodity)"]
  end

  subgraph API["Backend API (Supabase Edge Functions)"]
    R1["/simulate-order"]
    R2["/recalculate-order"]
    R3["/advance-operation-status"]
    R4["/emit-documents"]
    R5["/issue-invoice"]
    R6["/settle-operation"]
  end

  subgraph Engines["Core Engines (fonte de verdade)"]
    E1["Campaign"]
    E2["Product"]
    E3["Agronomic"]
    E4["Pricing Normalization"]
    E5["Combo Cascade"]
    E6["Payment Method"]
    E7["Commodity"]
    E8["Freight"]
    E9["Parity"]
    E10["Insurance (B&S)"]
    E11["Document"]
    E12["Guarantee"]
    E13["Invoicing"]
    E14["Monitoring"]
    E15["Settlement"]
    E16["Orchestrator"]
  end

  subgraph Dados["Dados e Memória de Cálculo"]
    D1["operations / operation_items"]
    D2["order_pricing_snapshots (ledger)"]
    D3["operation_logs / status_history"]
    D4["order_payment_selection / barter_details"]
    D5["document_instances / guarantees"]
  end

  subgraph Externos["Integrações e Mercado"]
    M1["Commodity Market"]
    M2["Frete / Basis / Câmbio"]
    M3["Assinatura / Formalização"]
    M4["Faturamento / Liquidação"]
  end

  UI --> API
  ADM --> API

  API --> Engines
  Engines --> Dados

  E7 <--> M1
  E8 <--> M2
  E9 <--> M2
  E11 <--> M3
  E13 <--> M4
  E15 <--> M4

  E16 --> E1
  E16 --> E2
  E16 --> E3
  E16 --> E4
  E16 --> E5
  E16 --> E6
  E16 --> E7
  E16 --> E8
  E16 --> E9
  E16 --> E10
  E16 --> E11
  E16 --> E12
  E16 --> E13
  E16 --> E14
  E16 --> E15
```

## 2) Diagrama de Fluxo (Execução da Simulação ao Settlement)

```mermaid
flowchart TD
  A["Início\nSeleção de Campanha + Contexto"] --> B["Product + Agronomic\n(quantidade, dose/ha, elegibilidade)"]
  B --> C["Pricing Normalization\n(gross-to-net, regras comerciais)"]
  C --> D["Combo Cascade\n(consumo de saldo e prioridade)"]
  D --> E["Payment Method\n(cash | credit | barter)"]

  E --> F{"Modo de Pagamento"}

  F -->|"cash/credit"| G["Cálculo Financeiro"]
  F -->|"barter"| H["Commodity + Freight + Parity + Insurance"]

  G --> I["Document Engine\n(checklist e pendências)"]
  H --> I

  I --> J["Guarantee Engine\n(colaterais e validações)"]
  J --> K["Invoicing Engine\n(emissão fiscal)"]
  K --> L["Monitoring Engine\n(saúde de operação)"]
  L --> M["Settlement Engine\n(liquidação por entrega/pagamento)"]

  M --> N["Fim\nStatus atualizado + logs + snapshot"]

  subgraph Governança["Regras Transversais"]
    O["Orchestrator\n(gates server-side)"]
    P["Ledger\n(snapshot imutável + blockingReasons[])"]
  end

  O -. valida avanço .-> B
  O -. valida avanço .-> I
  O -. valida avanço .-> M

  C -. registra .-> P
  D -. registra .-> P
  H -. registra .-> P
  M -. registra .-> P
```

## Observações
- Os diagramas seguem os princípios **order-first**, **engine-first**, **ledger-first** e **workflow data-driven** descritos na documentação base.
- O fluxo explicita o ponto de bifurcação de pagamento (financeiro versus barter) e a convergência em documentos/garantias até a liquidação.
