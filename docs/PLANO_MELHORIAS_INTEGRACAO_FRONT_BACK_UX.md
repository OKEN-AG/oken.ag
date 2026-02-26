# Plano de Melhorias — Integração Front/Back + UX (pós PR d0ea137)

## Diagnóstico rápido do estado atual

1. **Códigos de commodity sem normalização transversal**
   - Há risco de divergência entre valores (`SOJA` vs `soja`) em filtros, selects e persistência.
2. **Experiência de migração de rotas legadas estava abrupta**
   - Redirecionar sem contexto quebra entendimento do usuário.
3. **Dependência de MasterData sem fallback resiliente para campanhas antigas**
   - Campanhas prévias podem conter códigos que não estejam mais ativos no catálogo global.

## Ajustes realizados neste ciclo

- Normalização de commodity centralizada em utilitário compartilhado (`normalizeCommodityCode`).
- Fallback/label padronizados com `DEFAULT_COMMODITY_FALLBACK` e `toCommodityLabel`.
- Hook `useCommodityOptions` atualizado para:
  - sempre normalizar códigos,
  - preservar códigos já vinculados na campanha (mesmo fora do master ativo),
  - evitar “sumiço” de opção em edição de campanhas legadas.
- `CampaignFormPage`, `GeneralTab`, `OperationStepperPage` e `ParityPage` atualizados para usar normalização consistente em leitura, comparação e persistência.
- Rotas legadas (`/simulacao`, `/paridade`, `/documentos`) agora usam página de transição com contexto + auto-redirecionamento para `Nova Operação`.

## Imperfeições do plano anterior e correção recomendada

### 1) Governança de MasterData
**Imperfeição:** faltava contrato explícito de versionamento e política de desativação.

**Correção proposta:**
- Definir estado `active` como “não aparece para novas campanhas”, mas manter resolubilidade histórica.
- Bloquear remoção física; usar soft disable + auditoria.
- Incluir endpoint/visão de “compatibilidade” para listar campanhas impactadas por desativação.

### 2) Contrato de integração Campaign ↔ Operation
**Imperfeição:** sem checklist técnico formal para garantir consistência antes de ativar campanha.

**Correção proposta:**
- Validar no backend (RPC/trigger) os mínimos de ativação:
  - vigência,
  - commodity válida,
  - preço cash por produto,
  - regra geo/due date coerente.
- Expor retorno estruturado de erros para UI apresentar mensagens orientativas.

### 3) UX de migração Order-first
**Imperfeição:** estratégia de “redirect seco” sem pedagogia de produto.

**Correção proposta:**
- Manter páginas de transição por janela controlada (2–3 releases), com:
  - mensagem de mudança,
  - CTA único,
  - telemetria de cliques/abandono.

### 4) Qualidade de dados operacionais
**Imperfeição:** ausência de rotina de reconciliação periódica de commodities em operações já salvas.

**Correção proposta:**
- Job diário de consistência (somente leitura) com relatório:
  - código inválido,
  - campanha inativa,
  - método de pagamento incompatível.

## Próximos passos de implementação (ordem sugerida)

1. **Backend-first validações de ativação** (RPC + erro tipado).
2. **Painel de impacto de MasterData** no admin.
3. **Telemetria de migração de rotas legadas** (evento de origem e destino).
4. **Reconciliação diária e dashboard de saúde de dados**.

## Critério de “sistema ideal” para o plano

- Front e back validam as mesmas regras de domínio.
- Nenhuma operação ativa depende de commodity não resolúvel.
- Usuário sempre entende por que foi redirecionado e qual o próximo passo.
- Ativação de campanha só ocorre quando todas as dependências críticas estiverem consistentes.
