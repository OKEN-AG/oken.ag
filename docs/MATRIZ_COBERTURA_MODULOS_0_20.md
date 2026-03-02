# Matriz de Cobertura dos Módulos 0–20

## Escopo
Avaliar se os módulos do fluxo comercial/credito/faturamento estão **Representados**, **Parcialmente Representados** ou **Não Representados** no estado atual do sistema.

## Legenda
- ✅ Representado
- 🟡 Parcialmente representado
- ❌ Não representado

## Resultado executivo
- **Representados/Parciais fortes (0–7, 10, 13, 14–16, 18, 20)**: campanha, elegibilidade, lista base, seleção de pedido, pricing, meios de pagamento, formalização documental básica e monitoramento.
- **Lacunas críticas (8, 9, 11, 12, 17 risco/bureau, 19 emissão/faturamento)**: motor financeiro completo por linha de crédito, plano de parcelas por meio de pagamento, risco com bureaus e emissão/faturamento com certificados.

---

## Matriz detalhada

| Módulo | Status | Evidências atuais | Gap principal | Próximo passo objetivo |
|---|---|---|---|---|
| 0. Cadastro da Campanha | ✅ | Aba Geral + Financeiro + Elegibilidade + Produtos/Combos/Commodities no formulário da campanha. | Falta checklist transacional de ativação no backend. | Criar RPC de validação de ativação e bloquear `active=true` sem conformidade. |
| 1. Base Canais e Segmento | 🟡 | Segmentos e ajustes existem (`campaign_segments`, seleção de canal no fluxo). | Precedência formal e restrições/requerimentos por canal/segmento ainda incompletos. | Adicionar tabela de precedência e motor de resolução canal+segmento com trilha de decisão. |
| 2. Base Price List | ✅ | Portfólio por campanha com importação de código, nome, ref, preço cash/prazo e embalagem. | Data-base de lista (HOJE vs fixa) não explícita por versão. | Versionar lista por `base_date_type` e `base_date_value`. |
| 3. Input Seleção de canal | 🟡 | Operação possui seleção de canal e segmento antes da simulação. | Construção dinâmica de lista por regras comerciais ainda parcial. | Materializar “lista efetiva” por canal+segmento no início da operação. |
| 4. Input Sales Order | ✅ | Seleção de produtos no step de Pedido. | Falta UX de “lista recomendada por objetivo” e filtros avançados. | Adicionar filtros por cultura, margem, elegibilidade e busca por REF/código. |
| 5. Base Benefícios e Descontos (Offer Builder) | 🟡 | Combos com dose mín/máx e desconto; incentivo global em commodities. | Falta builder unificado por produto/cliente/pedido/volume/segmento com crédito separado de desconto. | Criar motor declarativo de regras com prioridade e stack de benefícios. |
| 6. Engine Pricing | ✅ | Engine calcula preço normalizado, desconto combo e memória de cálculo/snapshot. | Falta padronizar campos de saída com schema único para API/BI. | Publicar contrato `pricing_line_result` (produto a produto). |
| 6b. Base Linhas de Crédito | 🟡 | Há meios de pagamento e tipos básicos, com módulo de credores em evolução. | Linha de crédito completa (garantias, docs, tipos de liquidação, entrada) não está modelada ponta a ponta. | Criar entidades `credit_lines`, `credit_line_requirements`, `credit_line_restrictions`. |
| 7. Input Condições de Pagamento | 🟡 | Operador seleciona meio e prazo/due months. | Fluxo “à vista vs prazo + seleção de linha + exigências” não está completo. | Wizard de crédito com validações por linha selecionada. |
| 8. Engine Crédito (financeiro) | ❌ | Não há motor consolidado de principal/juros/parcela por linha. | Cálculo parcelado e dívida final incompleto. | Implementar engine financeiro com métodos (Price/SAC/Bullet/Misto). |
| 9. Output Condições de Pagamento | 🟡 | Existem saídas parciais de montantes no resumo. | Plano de pagamentos detalhado por parcela/meio ainda ausente. | Gerar `payment_plan` estruturado com cronograma e CET. |
| 10. Base de Meios de Pagamento | ✅ | Cadastro e uso de meios de pagamento por campanha. | Falta governança por segmento/canal e vigência por meio. | Introduzir política de elegibilidade por meio (canal/segmento/risco). |
| 11. Input Meio de Pagamento por parcela | ❌ | Seleção atual é agregada. | Não há seleção por parcela. | UI de alocação de meio por parcela com validação de mix permitido. |
| 12. Engine Meios de Pagamento | ❌ | Não há motor dedicado de CET por meio/parcela consolidado. | Custo efetivo final por composição de meios não calculado. | Implementar engine CET de meios e integrar ao resumo final. |
| 13. Output Pedido | 🟡 | Pedido consolidado é salvo com snapshot e validações básicas. | Pré-análise de restrições completa e decisão formal aceito/rejeitado ainda parcial. | Criar motor de decisão com códigos de bloqueio e explicabilidade. |
| 14. Base Documentos | ✅ | Tipos de documentos e fluxo de formalização já existem no produto. | Minutas versionadas por template/canal/linha ainda parcial. | Criar repositório de templates versionados com variáveis obrigatórias. |
| 15. Input Formalização | ✅ | Fluxo possui onboarding e coleta de dados para documentos. | Formulário único canônico ainda não centralizado. | Unificar coleta em `formalization_form` com schema e validação única. |
| 16. Output Formalização | 🟡 | Sistema gera estrutura para formalização e status documental. | Pipeline completo revisão/assinatura/registro/aprovação final ainda parcial. | Orquestrar estados documentais e integrações de assinatura. |
| 17. Engine Crédito (risco/bureau) | ❌ | Não há integração plena de risco com bureaus no fluxo final. | Score/risco com consulta externa ausente. | Criar `risk_engine` + conectores bureau + política de aprovação. |
| 17b. Input Aprovação Crédito | 🟡 | Há status e portal para acompanhamento, mas aprovação crédito formal está incompleta. | Falta fila operacional de crédito com parecer e SLA. | Implementar workbench de analista de crédito. |
| 18. Input Aprovação Vendas/Marketing | 🟡 | Aprovações comerciais existem de forma parcial nos fluxos/status. | Falta trilha formal por alçada/regra. | Adicionar matriz de alçadas e trilha de aprovação comercial. |
| 19. Output Pedido Emitido + certificados | ❌ | Emissão/faturamento/certificados não está fechado de ponta a ponta. | Falta integração e evento de emissão final. | Implementar evento `order_issued` + geração de certificados. |
| 20. Engine Monitoramento e Acompanhamento | 🟡 | Há módulo de monitoramento e acompanhamento operacional. | Monitoramento de eventos de docs/garantias/pagamentos ainda não totalmente event-driven. | Evoluir para trilha de eventos e alertas por mudança de atributo crítico. |

---

## Proposta de preenchimento do módulo 5 (Offer Builder)

Para fechar o “Base Benefícios e Descontos”, a estrutura recomendada é:

1. **Tipos de benefício**
   - `direct_discount_pct`
   - `credit_pct`
   - `credit_fixed_amount`
   - `rebate_post_liquidation`

2. **Escopos de regra**
   - por produto (`product_code/ref`)
   - por combo/bundle
   - por cliente (whitelist, cluster)
   - por pedido (ticket, mix, volume)
   - por segmento/canal

3. **Condições e precedência**
   - prioridade numérica
   - condição mínima de dose/quantidade/valor
   - política de acumulatividade (`stackable` / `exclusive_group`)
   - janela de vigência

4. **Resultado por item de pedido**
   - desconto aplicado (%)
   - crédito gerado (%) ou valor
   - motivo de elegibilidade/rejeição
   - regra de origem (id/version)

5. **Governança**
   - versionamento por campanha
   - auditoria de alteração
   - simulação explainable (por que aplicou/não aplicou)

---

## Priorização recomendada (90 dias)

1. **Onda 1 (Dias 1–30):** governança de domínio, schemas, outbox worker MVP, testes de isolamento entre tenants.
2. **Onda 2 (Dias 31–60):** APIs canônicas v1, enforcement de snapshot, observabilidade de eventos e DLQ.
3. **Onda 3 (Dias 61–90):** rails/reconciliação MVP, accounting events, ops console inicial.

### Gates de qualidade por onda

- cobertura de testes críticos;
- SLO de outbox;
- zero acesso cruzado entre tenants;
- reconciliação com taxa de mismatch abaixo do limite definido.

### Ritual de encerramento por onda

- review técnico-regulatório;
- plano detalhado da onda seguinte.
