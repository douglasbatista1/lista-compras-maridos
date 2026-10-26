# Segurança e privacidade

## Isolamento por família (RLS)
- RLS **ligado em todas as tabelas** de `public`.
- `is_family_member(fid)` e `is_family_owner(fid)` (security definer) verificam se o usuário (`auth.uid()`) é membro **ativo** da família. As políticas de listas, itens, produtos da família, compras e licença usam essas funções.
- **Privilégios por coluna** (defesa além do RLS): o cliente só altera `name` da lista; só altera `quantity_requested`, `quantity_purchased`, `status`, `note` e `position` do item; não altera `role` de membro; não escreve em `products`, `purchases`, `purchase_items` nem `entitlements`.
- **A chave `anon` não acessa nenhuma tabela.** O catálogo exige login. Foi uma escolha deliberada, para dificultar a cópia em massa de dados de terceiros.
- **Security Advisor do Supabase (22/10/2026):** as funções de gatilho foram retiradas da API (migration 0004). Continuam 11 avisos "SECURITY DEFINER executável por usuário logado", **aceitos de propósito**: são as RPCs que o app chama (criar família, convidar, concluir, clonar, enviar, ocultar, vagas) e as funções que as políticas RLS usam. Cada uma verifica `auth.uid()` e se a pessoa é membro ou responsável antes de agir; o teste `scripts/db/rls_isolation_test.sql` cobre todas.
- Operações de várias etapas rodam em RPCs que verificam a associação no servidor: `create_family`, `create_family_invite`, `accept_family_invite`, `complete_shopping_list`, `clone_shopping_list`.
- Um trigger impede que um item aponte para um produto particular de outra família.
- **Convites**: só o responsável cria, reenvia e cancela. O limite de 5 pessoas fica no banco. Um convite com e-mail só é aceito pela conta com o mesmo e-mail, mesmo que o link seja repassado.
- **Edge Function `invite-member`**: cria o convite com o JWT de quem chamou, ou seja, valendo o RLS e as regras. A `service_role` só é usada no servidor, para enviar o e-mail pelo Supabase Auth.
- **Senhas**: ficam só no Supabase Auth (hash). O app não guarda senha e exige no mínimo 8 caracteres, com letras e números. "Esqueci minha senha" mostra a mesma mensagem com ou sem conta, para não revelar quem está cadastrado.

### Teste automatizado A × B
`scripts/db/test_local.sh` sobe um PostgreSQL temporário, aplica as migrações e roda `scripts/db/rls_isolation_test.sql`. O teste verifica que a conta da Família B:
- não **lê** listas, itens, produtos particulares, membros, perfis nem compras de A;
- não **altera** nem **apaga** nada de A (0 linhas afetadas);
- não **insere** em listas ou na família de A, não usa produto particular de A e não chama RPCs sobre dados de A (todas as tentativas dão erro);
- não escreve no catálogo, em compras nem em licenças, não muda `role` e não marca lista como concluída sem RPC.

Também verifica que a `anon` não lê nada. Para conferir que o teste realmente detecta falhas, foi feito um controle negativo: com uma política enfraquecida de propósito, o teste falhou com `FALHA: B leu itens de A`.

O mesmo SQL pode rodar num Supabase local (`supabase start`) depois de criar usuários de teste.

## Segredos
- O app usa só `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (chave pública).
- A `service_role` vai **somente** em `.env.import.local` (ignorado pelo Git), para o script de importação.
- O `.gitignore` cobre `.env`, `.env.*` (exceto `.env.example`), chaves de assinatura e credenciais.
- O teste `src/__tests__/security.test.ts` procura JWT `service_role` e `sb_secret_` nos arquivos versionáveis. Também confere que `.env.example` não tem valores e que o app recusa uma `service_role` colocada por engano.
- Tokens do EAS e das lojas ficam nas contas Expo/Apple/Google, nunca no repositório.

## LGPD — dados tratados hoje
| Dado | Finalidade | Base legal provável* | Retenção |
|---|---|---|---|
| E-mail, nome de exibição | Login e identificação na família | Execução de contrato | Enquanto a conta existir |
| Nome e e-mail de quem foi convidado | Enviar o convite | Execução de contrato / legítimo interesse (validar) | Até aceitar ou cancelar; convites antigos devem ser apagados periodicamente |
| Listas, itens, compras, produtos da família | Funcionalidade principal | Execução de contrato | Enquanto a conta existir; apagar a família apaga tudo (cascade) |
| Compras excluídas do histórico pelo usuário (`list_hides`) | Histórico da família e, no futuro, análises de perfil de compra | **A definir** (legítimo interesse exige avaliação e transparência) | Mantidas após a exclusão do histórico; apagadas na exclusão da conta/família |
| Localização | **Não coletada** | — | — |

\* A base legal deve ser validada por um profissional antes da produção.

**Excluir do histórico ≠ apagar dado.** A tela informa que a compra deixa de aparecer para a pessoa e que o registro fica guardado. Usar esses dados para mapear perfil de compra exige:
- informar isso na política de privacidade;
- base legal validada;
- análises preferencialmente agregadas;
- exclusão efetiva quando o titular pedir a exclusão da conta.

**Antes de lançar comercialmente:**
- política de privacidade e termos de uso;
- função de excluir conta e exportar dados (exclusão em cascata a partir de `auth.users`, já modelada);
- canal para o titular exercer seus direitos;
- registro das operações de tratamento.

## Localização e ofertas (fase futura — não implementado)
- O MVP **não pede permissão de localização**. As permissões estão bloqueadas no Android, e há teste que verifica isso.
- No futuro: localização só em primeiro plano, pedida depois de explicar o benefício, com recusa sem prejuízo e reversível nas Configurações. A coordenada é usada para achar lojas próximas e **não é guardada**. Nada de histórico de GPS.
- Medição mínima: oferta exibida, aberta, produto adicionado à lista e resgate confirmado. "Adicionou à lista" não significa "comprou".
- Supermercados recebem só relatórios agregados e anonimizados, com grupos mínimos, depois de revisão de privacidade. Nunca histórico identificável da família nem localização bruta.
- Consentimento não resolve sozinho toda obrigação legal; a abordagem precisa de avaliação jurídica.

## Imagens do catálogo
As fotos têm **licença desconhecida** (`products.image_license = 'desconhecida'`). No modo demonstração, o app carrega as fotos do CDN de origem. Antes de distribuir comercialmente, é preciso obter autorização ou trocar por fotos próprias ou licenciadas.
