# Roadmap — Sistema Multi-Insumo e Incentivos Flexíveis

## Objetivo
Evoluir o BarterPro para operar com fluidez em sementes, fertilizantes, defensivos, maquinário e serviços,
com incentivos e benefícios configuráveis que podem:
- gerar desconto direto no preço;
- provisionar crédito para liberação;
- provisionar crédito para liquidação.

## Fase 1 (curto prazo)
- Tipagem de produto generalizada (`kind`, `pricingBasis`, `unitType` ampliado).
- Engine de incentivos baseada em regras com prioridade, cumulatividade e teto.
- Persistência de regras aplicadas no `gross_to_net` para auditabilidade.

## Fase 2 (médio prazo)
- Cadastro administrativo de regras de incentivos por escopo (global/item/segmento/cliente).
- Ledger separado de benefícios e créditos (desconto comercial vs crédito provisionado).
- Resolver server-side consolidando cálculo + snapshot + audit log.

## Fase 3 (escala)
- Estratégias de quantidade por tipo de item (hectare, unidade, hora, pacote).
- UX adaptativa por categoria de item.
- Monitoramento de ciclo de crédito (provisionado, liberado, compensado, expirado).

## Critérios de pronto
- Operações com diferentes tipos de insumo sem regra hardcoded por dose/hectare.
- Incentivos compostos com explicabilidade por regra aplicada.
- Trilha completa para auditoria e aprovação comercial/crédito.
