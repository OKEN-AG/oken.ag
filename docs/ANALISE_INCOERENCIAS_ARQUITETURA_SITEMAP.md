# Análise de incoerências — Arquitetura e Sitemap

## Escopo
Análise estática do frontend (roteamento + navegação) e aderência à arquitetura alvo documentada.

Arquivos-base:
- `src/App.tsx`
- `src/components/AppSidebar.tsx`
- `src/config/portals.ts`
- `public/robots.txt`
- `docs/architecture/adrs/0001-system-of-systems.md`
- `docs/architecture/oken-system-of-systems-target.md`
- `docs/PLANO_REMOCAO_LEGACY_ORDER_FIRST.md`

---

## 1) Sitemap atual (derivado do roteamento)

### 1.1 Rotas públicas
- `/auth`

### 1.2 Rotas autenticadas (core)
- `/`
- `/monitoramento`
- `/liquidacao`
- `/operacao/novo`
- `/operacao/:id`
- `/operacao/:id/analise-precos`
- `/operacao/:id/detalhe`

### 1.3 Rotas administrativas
- `/admin/campanhas`
- `/admin/campanhas/:id`
- `/admin/produtos`
- `/admin/frete`
- `/admin/commodities-masterdata`
- `/admin/pedidos`
- `/relatorios/gross-to-net`

### 1.4 Rotas de portais
- `/compradores`
- `/investidores`
- `/portal/credor-oem`
- `/portal/backoffice`
- `/portal/tomador`
- `/portal/fornecedor`
- `/portal/investidor`
- `/portal/compliance-auditoria`

### 1.5 Rotas legadas em transição
- `/simulacao` → redirect
- `/paridade` → redirect
- `/documentos` → redirect

---

## 2) Incoerências encontradas

## A. Duplicidade de conceito “Portal do Investidor” (Alta)
Há duas experiências com naming extremamente próximo para “investidor”, em árvores diferentes:
1. `/investidores` (página estática/overview)
2. `/portal/investidor` (portal operacional baseado em capabilities)

Além disso, existe um terceiro componente homônimo (`src/pages/investors/InvestorPortalPage.tsx`) que implementa jornada transacional e não está conectado ao `App.tsx`, sugerindo rota órfã/código paralelo.

**Risco:** confusão de produto, descoberta ambígua no menu e drift funcional entre telas com o mesmo domínio sem governança única.

## B. Gate de autorização inconsistente entre seções (Alta)
As rotas `/portal/*` usam `CapabilityRoute`, mas as rotas administrativas e de portais antigos (`/compradores`, `/investidores`) não usam gate explícito equivalente no roteador.

**Risco:** segurança por “esconder no menu” em vez de proteção de rota por capability.

## C. Sitemap técnico incompleto para indexação/auditoria (Média)
Existe `robots.txt`, porém não há `sitemap.xml` publicado em `public/`.

**Risco:** indexação ruim para superfícies públicas e ausência de inventário formal de URLs para governança.

## D. Estratégia de legado parcialmente concluída (Média)
O plano de remoção de legado prevê limpeza total em fases finais, mas o roteador mantém redirecionamentos legados. Isso pode ser esperado em transição, porém sem prazo visível no código para hard-cutover.

**Risco:** transição indefinida e acúmulo de “temporário permanente”.

## E. Arquitetura alvo (4 camadas) ainda pouco explícita na camada de interfaces (Média)
A arquitetura-alvo exige separação estável entre Interfaces, Common Core, Adapters e Wrappers. No frontend, há sinais positivos (`domains/core`, `domains/adapters`), mas o sitemap mistura navegação “administrativa”, “portais por perfil” e “portais legados” no mesmo shell de UI sem boundary de produto explícito.

**Risco:** aumento de acoplamento entre experiências e dificuldade de escalar ownership por domínio.

---

## 3) Recomendações objetivas

1. **Unificar taxonomia de portais**
   - Escolher um único padrão para investidor (`/portal/investidor` *ou* `/investidores`) e deprecar o outro.
   - Consolidar/arquivar `src/pages/investors/InvestorPortalPage.tsx` se estiver fora do fluxo oficial.

2. **Padronizar proteção por capability**
   - Aplicar `CapabilityRoute` (ou equivalente) para todas as rotas administrativas e portais não versionados.

3. **Formalizar sitemap**
   - Criar `public/sitemap.xml` e opcionalmente referenciá-lo no `robots.txt`.

4. **Fechar ciclo de legado**
   - Adicionar flag/telemetria + data de descontinuação para `/simulacao`, `/paridade`, `/documentos`.
   - Evoluir para 410/404 amigável conforme fase F do plano.

5. **Separar “surface area” de navegação**
   - Estruturar App Router por subárvores (`/admin/*`, `/portal/*`, `/ops/*`) com owners e políticas de acesso explícitas.

---

## 4) Matriz rápida de severidade

- **Alta**: A (duplicidade de portal investidor), B (gate inconsistente).
- **Média**: C (sitemap ausente), D (legado sem hard cutover), E (boundaries de interface pouco explícitos).
- **Baixa**: n/a nesta rodada.
