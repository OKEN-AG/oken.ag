# Backlog Executável — 20 Ondas (BarterPro)

Este backlog converte a arquitetura unificada em itens aprováveis (épico, entregáveis, DoD e risco).

## Bloco A — Ondas 1-6 (Comercial base)

## Onda 1 — Estrutura e navegação
- Entregáveis:
  - menu e rotas consolidadas de campanha/produto/combo/simulação
  - permissões mínimas por perfil
- DoD:
  - usuário autenticado navega sem erro por todos os módulos base

## Onda 2 — Formulário de simulação
- Entregáveis:
  - formulário com campanha/canal/cliente/cidade/área/produtos
- DoD:
  - persistência de rascunho com operação + itens

## Onda 3 — Agronomic engine
- Entregáveis:
  - cálculo área × dose
  - arredondamento por caixa/palete/caminhão
- DoD:
  - itens sempre fecham embalagem logística

## Onda 4 — Pricing normalization v1
- Entregáveis:
  - conversão moeda + vista/prazo + juros
- DoD:
  - total prazo consistente com seleção de vencimento

## Onda 5 — Combo simples
- Entregáveis:
  - ativação de combo por critérios mínimos
- DoD:
  - desconto refletido no montante total

## Onda 6 — Combo cascata completo
- Entregáveis:
  - prioridade por desconto + abrangência
  - ledger de consumo/remanescente
- DoD:
  - sem dupla contagem de produto entre combos

---

## Bloco B — Ondas 7-12 (Preço ponta e barter)

## Onda 7 — Margens por canal/segmento
- Entregáveis:
  - margens parametrizadas por canal/segmento
- DoD:
  - pricing separa receita comercial, margem e financeiro

## Onda 8 — Gross-to-net detalhado
- Entregáveis:
  - painel gross→net com componentes
- DoD:
  - snapshot auditável por simulação

## Onda 9 — Commodity manual
- Entregáveis:
  - formulário de commodity com preço manual
- DoD:
  - conversão montante→sacas operacional

## Onda 10 — Commodity automático
- Entregáveis:
  - bolsa, contrato, câmbio, basis, deltas
- DoD:
  - preço líquido commodity reproduzível por parâmetros

## Onda 11 — Redutor logístico
- Entregáveis:
  - base cidade/porto/km/custo
- DoD:
  - preço interior ajustado por redutor

## Onda 12 — Paridade completa
- Entregáveis:
  - sobreposição de preço contrato
  - preço valorizado e comparação nominal/%
- DoD:
  - paridade final com trilha de cálculo completa

---

## Bloco C — Ondas 13-17 (Hedge e governança)

## Onda 13 — Seguro simplificado
- Entregáveis:
  - adicional de proteção convertido em sacas
- DoD:
  - impacto visível em paridade final

## Onda 14 — Black-Scholes
- Entregáveis:
  - prêmio por volatilidade/tempo/taxa livre risco
- DoD:
  - prêmio convertido em custo da operação

## Onda 15 — Fontes de recurso
- Entregáveis:
  - fontes: próprio/FIDC/banco/trading
  - funding cost e spread
- DoD:
  - resultado financeiro separado por fonte

## Onda 16 — Pedido + termo barter
- Entregáveis:
  - emissão e assinatura eletrônica
- DoD:
  - status documental rastreável por operação

## Onda 17 — CCV/CPR/Cessão
- Entregáveis:
  - templates e vínculo documental
  - bloqueio por pendência
- DoD:
  - faturamento bloqueado sem docs obrigatórios

---

## Bloco D — Ondas 18-20 (Liberação e pós-operação)

## Onda 18 — Invoicing engine
- Entregáveis:
  - provisões (financeira/margem/custo barter)
  - integração de faturamento
- DoD:
  - operação liberada apenas com todos gates válidos

## Onda 19 — Monitoring engine
- Entregáveis:
  - saúde garantias
  - preço commodity e alertas
  - saúde produtiva (NDVI quando disponível)
- DoD:
  - dashboard operacional com alertas acionáveis

## Onda 20 — Settlement engine
- Entregáveis:
  - entrega grãos
  - conciliação e compensação
  - encerramento da operação
- DoD:
  - operação liquidada com trilha financeira completa

---

## Critérios transversais (todas as ondas)
- cálculo crítico sempre no backend
- snapshot por decisão
- explicabilidade de bloqueio
- logs e histórico de status
- compatibilidade com legado durante migração
