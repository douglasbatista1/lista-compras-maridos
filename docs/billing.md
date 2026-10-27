# Cobrança do acesso da família (RevenueCat)

Modelo planejado: **R$ 10 por família, pagamento único**, comprado dentro do app pela App Store (e Google Play).
Hoje a cobrança **não está ativa**: nada no app é bloqueado e a aba Família só mostra a situação do acesso.

## Como funciona
```
App (react-native-purchases, Purchases.logIn(user.id))
  → compra pela Apple (In-App Purchase)
  → RevenueCat valida e envia o webhook
  → Edge Function revenuecat-webhook (confere o segredo)
  → apply_store_event (service_role) grava em entitlements da família
  → app lê entitlements (somente leitura, RLS por família)
```
- A compra vale para a família de quem comprou (a família ativa mais antiga da pessoa).
- Reembolso (`CANCELLATION` com `CUSTOMER_SUPPORT`) → `refunded`. Transferência (`TRANSFER`, compra restaurada
  em outra conta) → a nova família ganha, a antiga perde.
- Eventos repetidos não mudam nada, e eventos atrasados não desfazem um estado mais novo.
- **Cortesia:** uma linha em `entitlements` com `provider = 'courtesy'` libera a família sem pagamento e não é
  alterada por eventos da loja. A família do Douglas já tem cortesia.

## Já feito
- Migração `20261027000800_store_purchases.sql` (aplicada no Supabase) e testes em `scripts/db/rls_isolation_test.sql`.
- Edge Function `revenuecat-webhook` publicada. **Recusa tudo (503) até o segredo ser configurado.**
- Aba Família mostra *Cortesia*, *Comprado* ou *Gratuito*.

## Falta (depende da conta Apple paga)
1. Criar a conta grátis na RevenueCat e um projeto.
2. No App Store Connect: criar a compra **não consumível** (ex.: `acesso_familia`, no preço mais próximo de R$ 10
   entre os que a Apple oferece) e conectar a RevenueCat (chave In-App Purchase).
3. Na RevenueCat: entitlement `familia`, offering padrão com o produto.
4. Webhook na RevenueCat → URL `https://<ref>.supabase.co/functions/v1/revenuecat-webhook` e um *Authorization
   header* longo e aleatório. O mesmo valor vai para o Supabase:
   `npx supabase secrets set REVENUECAT_WEBHOOK_SECRET=<valor>`.
5. No app: `npx expo install react-native-purchases react-native-purchases-ui expo-dev-client`, configurar com a
   chave pública da Apple (`EXPO_PUBLIC_REVENUECAT_IOS_KEY`), chamar `Purchases.logIn(user.id)` após o login e
   `Purchases.logOut()` ao sair, e criar a tela de compra com o botão **Restaurar compras** (exigido pela Apple).
   No Expo Go a biblioteca roda em modo de prévia (sem compra real); para comprar de verdade é preciso uma build.
6. Decidir o que fica bloqueado sem o acesso (ex.: convidar pessoas, depois de X listas) e só então ligar o bloqueio.
