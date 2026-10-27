# Modelo de dados

Banco PostgreSQL **compartilhado**. O isolamento entre famílias é lógico, feito por `family_id` e RLS. Não há um banco por cliente.
Migrações em `supabase/migrations/`:

| Arquivo | Conteúdo |
|---|---|
| `20261022000100_core_schema.sql` | Tabelas, índices e triggers |
| `20261022000200_rls_and_rpc.sql` | RLS, privilégios por coluna, RPCs, bucket e Realtime |
| `20261022000300_search_synonyms.sql` | Sinônimos de busca |

## Entidades

| Tabela | Escopo | Papel |
|---|---|---|
| `profiles` | usuário | Nome de exibição. Criado por trigger quando o usuário é criado no Auth. |
| `families` | família | Conta doméstica. |
| `family_members` | família | Usuário, papel (`owner`/`member`), status (`active`/`removed`) e datas. Aceita 2 ou mais contas. |
| `family_invites` | família | Convite de uso único, validade de 7 dias: código de 8 caracteres, `name`, `email` e `email_sent_at`. Um convite pendente por e-mail em cada família. |
| `products` | **global** | Catálogo. Id estável (uuid5 de `giassi:<sku>`), `(source, source_id)` único, GTIN validado, tamanho (`size_value`, `size_unit`, `pack_qty`, `size_label`), categoria, caminho da foto (`image_path`), origem e licença da foto. `search_text` é gerado e normalizado. |
| `product_aliases` | global | Nomes alternativos de um produto específico. |
| `search_synonyms` | global | Sinônimos de termos ("detergente" → "lava loucas"). |
| `family_products` | família | Produtos cadastrados à mão. **Nunca** entram no catálogo global. |
| `shopping_lists` | família | Nome, tipo `kind` (`complete` = catálogo com foto; `simple` = texto livre), status (`active`/`completed`/`archived`), `source_list_id` ("comprar novamente"), `sent_at`/`sent_by` ("Enviar lista") e datas. |
| `list_hides` | usuário | Lista **concluída** que um usuário excluiu do próprio histórico. A lista e a compra continuam no banco. |
| `shopping_list_items` | família | `product_id` **ou** `family_product_id`, cópia de identificação do produto (*snapshot*), `quantity_requested`, `quantity_purchased`, status e `checked_at/by`. |
| `purchases` | família | **Compra confirmada**: 1 por lista concluída. |
| `purchase_items` | família | Itens efetivamente comprados, com snapshot e quantidade comprada. |
| `app_admins` | produto | Administradores do app (equipe), não confundir com o responsável da família. Só se cadastra por SQL/painel; `is_app_admin()` diz se quem está logado é admin. |
| `entitlements` | família | Acesso da família (R$ 10, `family_lifetime`; `provider` = `revenuecat` ou `courtesy`). Só o servidor escreve (webhook `revenuecat-webhook` → `apply_store_event`). |

## Regras de integridade
- **Snapshot**: o item guarda nome, marca, variante, tamanho, categoria e foto do momento em que foi adicionado. Mudanças no catálogo não reescrevem o histórico.
- **Lista ≠ compra**: marcar um item não é compra. A compra só existe quando a lista é concluída e confirmada (`complete_shopping_list`). Os itens não marcados continuam na lista como não comprados.
- **Quantidade pedida ≠ comprada**: são colunas separadas.
- **Embalagens diferentes nunca se misturam**: cada tamanho é um produto com id próprio. Adicionar o mesmo id soma a quantidade; ids diferentes viram itens diferentes.
- **Comprar novamente** (`clone_shopping_list`): cria uma lista nova com ids novos e itens pendentes. A original não muda.
- Lista concluída: não aceita novos itens (trigger) e não pode ser apagada (política RLS).
- **Excluir lista**: se ainda não foi concluída, é apagada de vez (`delete`). Se já foi concluída, `hide_shopping_list` grava em `list_hides`: ela some só para quem excluiu, e os outros membros continuam vendo. Lista, itens e compra permanecem para o histórico de compras.
- **Lista simples** (`kind = 'simple'`): itens só com texto (`name_snapshot`) e quantidade, sem `product_id` nem foto. O mesmo texto (sem diferença de maiúsculas e acentos) soma a quantidade. "Comprar novamente" mantém o tipo.
- **Enviar lista** (`send_shopping_list`): exige pelo menos 1 item; marca `sent_at`. Quem abre o app com uma lista enviada e não concluída cai direto nela.
- **Limite da família**: responsável + até 5 pessoas (membros ativos + convites pendentes), verificado em `create_family_invite` e de novo em `accept_family_invite` (`family_invite_slots`). Convite com e-mail só é aceito pela conta com esse e-mail.
- **Perfil garantido**: `create_family` e `accept_family_invite` criam o perfil se ele faltar (migration 0006), porque `family_members` depende dele.
- `shopping_list_items.family_id` é sempre copiado da lista pelo trigger. O valor enviado pelo cliente é ignorado.

## Índices
- `products`: GIN trigram em `search_text` e `search_name`, índice em `department`, GTIN único parcial.
- `family_members (user_id) where active`, `shopping_lists (family_id, status, updated_at desc)`, `shopping_list_items (list_id, position)`, `(family_id)`, `(product_id)`, `purchases (family_id, confirmed_at desc)`, `purchase_items (family_id, product_id)`.

## Datas e fusos
Todas as colunas de data são `timestamptz` e ficam gravadas em UTC. O app grava ISO 8601 UTC (`toISOString()`) e converte para o fuso do aparelho só na exibição (`src/domain/format.ts`, pt-BR). Na reposição, compras do mesmo dia (UTC) contam como uma só.

## Modo local
Mesmas entidades em formato JSON, numa chave do AsyncStorage por família (`lcm:v1:family:<id>`): listas, compras e produtos da família. O catálogo é somente leitura (`assets/catalog/catalog.json`). Os ids dos produtos são os mesmos uuid5 do banco.
