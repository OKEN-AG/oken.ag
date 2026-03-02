# Política de rotação e validação de claims JWT (tenant-aware)

## Objetivo
Garantir que os claims `tenant_id`, `role` e `org_scope` sejam confiáveis para RLS e autorização de domínio.

## Claims obrigatórios
- `sub`: UUID do usuário autenticado.
- `tenant_id`: UUID do tenant ativo da sessão (obrigatório para leitura/escrita tenant-aware).
- `role`: papel lógico da sessão (`authenticated`, `manager`, `admin`, etc).
- `org_scope`: array de UUIDs das organizações autorizadas no contexto da sessão.

## Regras de validação (emissão + consumo)
1. `tenant_id` deve ser UUID válido e pertencer ao conjunto de tenants do usuário.
2. `role` deve ser emitido a partir de fonte de verdade transacional (não do client).
3. `org_scope` deve conter apenas organizações vinculadas ao `tenant_id` do token.
4. Rejeitar token quando houver:
   - ausência de `tenant_id` em rotas protegidas;
   - `tenant_id` inválido;
   - `org_scope` contendo organização de outro tenant;
   - `role` fora da matriz de permissões cadastrada.

## Política de rotação
- **Access token**: TTL curto (5–15 minutos).
- **Refresh token**: rotação a cada uso (one-time), com revogação em cadeia quando detectado replay.
- **Assinatura**:
  - preferir par assimétrico (ex: `RS256`);
  - manter `kid` no header e publicar JWKS interno.
- **Rotação de chaves**:
  - rotação programada a cada 90 dias;
  - rotação extraordinária imediata em incidente;
  - manter chave anterior por janela de sobreposição curta (ex: 24h).

## Fluxo recomendado de mudança de tenant ativo
1. Usuário seleciona tenant ativo.
2. Backend valida vínculo usuário-tenant.
3. Backend emite novo access token com `tenant_id` e `org_scope` compatíveis.
4. Sessões anteriores do mesmo usuário+device podem ser invalidadas (opcional por risco).

## Controles operacionais
- Logar `sub`, `tenant_id`, `role`, tamanho de `org_scope`, `kid`, `iat`, `exp`.
- Alertar para:
  - taxa elevada de falha por claim inválido;
  - replay de refresh token;
  - uso de chave expirada/desconhecida.
- Executar auditoria periódica comparando permissões efetivas vs claims emitidos.

## Relação com o banco (RLS)
- `public.current_tenant_id()` deve apenas interpretar claim JWT com fallback seguro para `NULL`.
- Políticas RLS devem negar acesso quando `tenant_id` não estiver presente ou válido.
- Claims de alto impacto (`role`, `org_scope`) devem ser validados no backend antes de consultas sensíveis.
