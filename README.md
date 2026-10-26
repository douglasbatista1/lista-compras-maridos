# Lista de Compras para Maridos

*A lista certa. O produto certo. Sem complicação.*

App Android/iOS (Expo + React Native + TypeScript) para montar a lista da casa com o **produto exato**: foto, marca, variante e tamanho. Outra pessoa da família abre a mesma lista e marca o que comprou. Funciona com qualquer supermercado.

- **Catálogo real**: 11.280 produtos (coleta Giassi, sem preços).
- **Dois tipos de lista**: *completa* (produtos do catálogo, com foto, marca e tamanho) e *simples* (a pessoa escreve o que precisa, sem fotos nem busca).
- **Modo demonstração** funciona sem nenhuma conta, com dados só no aparelho.
- **Modo Supabase** (contas, família e sincronização) é ativado por variáveis de ambiente.

Documentação: [inventário](docs/project-inventory.md) · [arquitetura](docs/architecture.md) · [modelo de dados](docs/data-model.md) · [segurança e privacidade](docs/security-and-privacy.md) · [importação do catálogo](docs/catalog-import.md) · [roadmap](docs/roadmap.md)

## Pré-requisitos
- Node.js 20+ (testado com 26.5) e npm
- Python 3.10+ (scripts do catálogo)
- Opcional: PostgreSQL 15+ local (teste de RLS), conta Expo (EAS), projeto Supabase

## Rodar localmente
```bash
npm install
npm start          # QR code para o Expo Go; "a" Android, "i" iOS, "w" web
```
As bibliotecas usadas são compatíveis com o Expo Go (SDK 58); não é preciso development build para testar.

| Comando | O que faz |
|---|---|
| `npm test` | Testes Jest (domínio, repositório local, catálogo real, segurança e fluxo de telas) |
| `npm run typecheck` / `npm run lint` | TypeScript e ESLint |
| `scripts/db/test_local.sh` | Postgres temporário: migrações + importação 2× + teste de isolamento RLS |
| `npm run catalog:validate` / `npm run catalog:build` | Valida o catálogo / regenera `assets/catalog/catalog.json` |
| `npm run export:web` | Exporta a versão web em `dist/` |

## Ambiente
Copie `.env.example` para `.env` (o `.env` é ignorado pelo Git):
```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<chave publishable/anon>
```
Sem essas duas variáveis, o app roda em **modo demonstração**. **Nunca** coloque a `service_role` em `EXPO_PUBLIC_*`: o app recusa essa chave.

## Ativar o Supabase
1. Crie um projeto em supabase.com (região `sa-east-1`). Atenção: no plano gratuito, cada organização só pode ter 2 projetos ativos.
2. Aplique as migrações. Escolha uma opção:
   - CLI: `npx supabase login`, depois `npx supabase link --project-ref <ref>`, depois `npx supabase db push`
   - ou cole no SQL Editor os arquivos de `supabase/migrations/`, em ordem.
3. **Authentication → Providers → Email**: deixe ligado, com "Confirm email" ativo. Em *Password*, mínimo de 8 caracteres.
4. **Authentication → URL Configuration**:
   - **Site URL:** `https://lista-compras-maridos.vercel.app`
   - **Redirect URLs:** `https://lista-compras-maridos.vercel.app/**`, `listacompras://**` (app instalado), `exp://**` (Expo Go) e `http://localhost:8081/**` (web local).
   - Os links de confirmação de cadastro, convite e "esqueci minha senha" só voltam para endereços dessa lista.
5. **E-mail de verdade (obrigatório para convites):** em *Authentication → Emails → SMTP Settings*, configure um provedor (Resend, Brevo, Amazon SES…) com o seu domínio verificado (SPF/DKIM). O servidor de e-mail padrão do Supabase só serve para teste, porque envia poucos e-mails por hora.
6. **Templates de e-mail** (*Authentication → Emails → Templates*):
   - **Invite user**: cole `supabase/templates/invite.html`. Assunto sugerido: `{{ .Data.invited_by_name }} convidou você para a lista da família`.
   - **Magic Link**: inclua `{{ .Token }}`, para a opção "Entrar com código".
7. **Database → Publications**: confirme que `shopping_lists` e `shopping_list_items` estão em `supabase_realtime` (a migração adiciona as duas).
8. **Edge Function de convite**:
   ```bash
   npx supabase functions deploy invite-member
   npx supabase secrets set INVITE_REDIRECT_URL=listacompras://convite
   ```
   A função usa as variáveis padrão do Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). A chave secreta fica só no servidor.
   Sem a função publicada, o app cria o convite mesmo assim e mostra o código para você enviar à pessoa.
9. Preencha o `.env` com a URL e a chave **publishable** (Settings → API).
10. Importe o catálogo seguindo [docs/catalog-import.md](docs/catalog-import.md). A importação usa `.env.import.local` com a `service_role`, só na sua máquina.
11. Rode `npm start`. Crie a conta (e-mail e senha), crie a família e convide pessoas na aba **Família**.

### Convites por e-mail
- O responsável pela família informa **nome e e-mail** de até **5 pessoas** (cônjuge, filhos, quem ajuda em casa).
- A pessoa recebe o e-mail, toca em **Aceitar convite**, cria a senha no app e já entra na família.
- Só a conta com o e-mail convidado consegue aceitar.
- Na aba Família o responsável pode reenviar, cancelar e remover pessoas.
- Se a pessoa já tiver conta, o app mostra um código de 8 letras para ela digitar.
- O link vale por 7 dias.

## GitHub
O repositório local já está inicializado, ainda sem commits. Para publicar:
```bash
git add -A && git commit -m "MVP Lista de Compras para Maridos"
gh repo create lista-compras-maridos --private --source . --push
```
O `.gitignore` deixa de fora `.env*`, credenciais, `dist/`, `node_modules/` e os dados brutos (`Banco de produtos/` tem ≈530 MB de fotos de terceiros). O catálogo compacto `assets/catalog/catalog.json` é versionado.

## Builds Android/iOS (EAS)
`eas.json` tem três perfis:

| Perfil | Saída | Uso |
|---|---|---|
| `development` | development client, distribuição interna | Desenvolvimento com módulos nativos |
| `preview` | APK Android / build iOS interna (ad hoc) | Testar em aparelhos reais |
| `production` | **AAB** (Google Play) / IPA (App Store Connect) | Lojas; `autoIncrement` da versão |

```bash
npm install -g eas-cli         # ou use npx eas-cli@latest
eas login
eas init                       # vincula o projeto (grava o projectId em app.json)
eas build --platform android --profile preview
eas build --platform android --profile production
eas build --platform ios --profile production
eas submit --platform android  # / ios — envio às lojas
```
**Antes da primeira build de loja:**
- troque `com.placeholder.listacomprasmaridos` (em `app.json`, `ios.bundleIdentifier` e `android.package`) pelo identificador definitivo; ele não pode mudar depois;
- **iOS**: conta Apple Developer (anual), app criado no App Store Connect; certificados e perfis podem ser gerados pelo EAS;
- **Android**: conta Google Play Console (taxa única), app criado no console, chave de serviço para `eas submit`; o primeiro envio costuma ser manual;
- metadados, capturas de tela, política de privacidade (URL) e o questionário de segurança de dados das lojas.

## Web (Vercel)
O projeto `lista-compras-maridos` na Vercel está ligado a este repositório: cada push na `main` publica sozinho.
- Configuração em `vercel.json` (build `npx expo export --platform web`, saída `dist`, todas as rotas para o `index.html`).
- Variáveis na Vercel: `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (as duas são públicas).
- **Autor dos commits:** a Vercel bloqueia a publicação se o e-mail do autor do commit não for de uma conta do GitHub. Neste repositório, o e-mail configurado é o automático do GitHub (`…@users.noreply.github.com`).

## Web (alternativa: Netlify)
`npm run export:web` gera a SPA em `dist/` (`web.output: "single"` com `public/_redirects`). O `netlify.toml` está pronto: conecte o repositório no Netlify ou use `npx netlify deploy --dir dist`. Nada foi publicado.

## Custos e limites a monitorar
Os valores mudam; confira as páginas de preço antes de depender deles.
- **Supabase Free**: 2 projetos ativos por organização (a sua já tem 2), banco de 500 MB, Storage de 1 GB (as fotos ocupam ≈500 MB), cota de tráfego mensal, e o projeto **pausa após cerca de 1 semana sem uso**. Para operação comercial, use o plano Pro.
- **EAS Free**: número limitado de builds por mês, com fila de baixa prioridade.
- **Lojas**: Apple Developer Program (anual) e Google Play (taxa única).
- **Netlify** (se usar): plano gratuito com limite de banda.
- Configure alertas de uso no Supabase e no Expo. Nunca habilite cobrança sem decisão explícita.

## Limitações atuais
- O modo Supabase (repositório, login, convite, Realtime) foi implementado, e o SQL foi testado num Postgres local, mas **ainda não rodou contra um projeto Supabase real**.
- Fotos com licença desconhecida, servidas pelo CDN de origem no modo demonstração.
- O modo Supabase ainda não tem fila offline (ele mostra o erro e desfaz a alteração).
- O convite no modo local é **demonstrativo**. O pagamento (R$ 10 por família) está planejado e não aparece no app.
- O convite por e-mail foi implementado e testado com Supabase simulado e Postgres local. **O envio real do e-mail e o retorno do link para o app ainda não foram verificados**: dependem do projeto Supabase, do provedor de e-mail e do domínio.
- O app não usa localização.
