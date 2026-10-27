# Arquitetura

```
┌──────────────── App (Expo / React Native, TypeScript) ────────────────┐
│ src/app/        rotas (Expo Router): abas Listas, Produtos,            │
│                 Histórico, Família; lista/[id], adicionar, etc.        │
│ src/components/ UI da marca (ui.tsx, product.tsx, ProductSearch.tsx)   │
│ src/domain/     regras puras: listas, busca, reposição, tipos          │
│ src/data/       DataRepository  ◄── mesmo contrato ──►                 │
│                 ├─ LocalRepository   (AsyncStorage + catálogo local)   │
│                 └─ SupabaseRepository (PostgREST, RPC, Realtime)       │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ HTTPS: chave pública + JWT do usuário
┌───────────────────────────────▼────────────────────────────────────────┐
│ Supabase: Postgres (RLS), Auth (código por e-mail), Storage (fotos),    │
│ Realtime (marcações do cônjuge na hora)                                 │
└────────────────────────────────────────────────────────────────────────┘
        ▲ service_role (só na máquina do administrador)
        └── scripts/catalog/import_catalog.py push
```

## Modos de execução

| Modo | Quando liga | O que acontece |
|---|---|---|
| **Demonstração** (padrão) | Faltam `EXPO_PUBLIC_SUPABASE_URL` e a chave pública | Dados ficam só no aparelho (AsyncStorage). Catálogo real empacotado com 11.280 produtos. Busca em memória. Aviso "Modo demonstração" visível. Convite e pagamento aparecem como demonstrativos. |
| **Supabase** | URL + chave pública definidas no `.env` | Login por código enviado por e-mail, criação de família ou entrada por convite, listas compartilhadas, busca no servidor (`search_products`) e Realtime no checklist. |

Se alguém colocar uma chave `service_role` no app por engano, `src/config/env.ts` recusa a chave e o app volta ao modo demonstração.

> **Status do modo Supabase:** o SQL (migrações, RLS e RPCs) foi testado num PostgreSQL 17 local que simula o Supabase. O `SupabaseRepository` e as telas de login **ainda não rodaram contra um projeto Supabase real**, porque não há projeto nem credenciais para este app.

## Decisões
- **Contrato único** (`src/data/repository.ts`): as telas não sabem de qual backend vêm os dados.
- **Regras puras** (`src/domain/lists.ts`) são usadas pelo modo local e para a atualização otimista na tela. O servidor repete as mesmas regras (trigger e RPCs). Um teste verifica que a lista de sinônimos é igual no app e no SQL.
- **Atualização otimista no checklist**: a marcação aparece na hora. Se o servidor recusar, a tela volta ao estado anterior e mostra o erro.
- **Busca**: no modo local, índice em memória (cerca de 1 ms por consulta). No Supabase, RPC com `pg_trgm` e índices GIN. Debounce de 250 ms. Os sinônimos ficam em `search_synonyms`.
- **Sem localização, anúncios, filas ou microsserviços no MVP.** O Android bloqueia explicitamente as permissões de localização (`app.json`).

## Build e distribuição
- **Nativo**: EAS Build (`eas.json`, perfis `development`, `preview` e `production`). Ver o README.
- **Web** (opcional, só para demonstração): `npm run export:web` gera `dist/` como SPA (`web.output: "single"`, com `public/_redirects`). O `netlify.toml` está pronto, mas **não foi publicado**.
- Identificador do app: `com.douglasbatista.listacomprasmaridos` (iOS e Android). Não pode mudar depois da primeira publicação nas lojas.
