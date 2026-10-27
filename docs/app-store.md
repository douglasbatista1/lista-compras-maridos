# App Store (iOS): o que já está pronto e o que falta

Atualizado em 27/10/2026.

## Usar agora, sem pagar nada
- **iPhone da família (recomendado):** abra https://lista-compras-maridos.vercel.app no **Safari** e toque em
  *Compartilhar* → *Adicionar à Tela de Início*. O app abre em tela cheia, com ícone próprio, usando a mesma conta e as
  mesmas listas. Ele é atualizado a cada push na `main`.
- **Desenvolvimento:** `npm start` e o app **Expo Go** no iPhone (só enquanto o computador estiver rodando o servidor).
- **Simulador no Mac (sem conta Apple paga):** `npx eas-cli@latest build --platform ios --profile ios-simulator`
  gera um app para o Simulador do Xcode.

## Já pronto no código
| Exigência da Apple | Onde |
|---|---|
| Identificador definitivo `com.douglasbatista.listacomprasmaridos` | `app.json` (`ios.bundleIdentifier`, `android.package`) |
| Excluir a conta dentro do app (guideline 5.1.1(v)) | Família → *Excluir minha conta* (`src/app/excluir-conta.tsx`, Edge Function `delete-account`) |
| Política de Privacidade pública | https://lista-compras-maridos.vercel.app/privacidade |
| Termos de Uso públicos | https://lista-compras-maridos.vercel.app/termos |
| Declaração de criptografia (só HTTPS padrão) | `ITSAppUsesNonExemptEncryption: false` em `app.json` |
| Sem rastreamento, anúncios ou localização | permissões de localização bloqueadas; nenhum SDK de anúncio |
| Login só por e-mail e senha (não exige "Entrar com a Apple") | — |
| Base da compra do acesso (RevenueCat → webhook → `entitlements`) | ver [billing.md](billing.md) |

## Quando pagar o Apple Developer Program (US$ 99/ano)
1. Inscreva-se em https://developer.apple.com/programs/enroll/ (pessoa física, com o seu ID Apple).
2. No App Store Connect, crie o app com o bundle id `com.douglasbatista.listacomprasmaridos`.
3. Entre no **Small Business Program** (comissão menor).
4. `npx eas-cli@latest login` e `npx eas-cli@latest init` (vincula o projeto Expo).
5. `npx eas-cli@latest build --platform ios --profile production` (o EAS cria certificados e perfis).
6. `npx eas-cli@latest submit --platform ios` → TestFlight para a família testar.
7. Preencha no App Store Connect:
   - URL de privacidade (`/privacidade`) e de suporte (pode ser a mesma página de termos);
   - questionário de privacidade: e-mail, nome, conteúdo do usuário (listas), identificador de usuário; nenhum
     dado usado para rastreamento;
   - classificação etária, capturas de tela (6,9" e 6,5"), descrição e palavras-chave;
   - **conta de teste para a revisão** (e-mail e senha de uma conta com família criada).
8. Troque o link dos convites para o app: segredo `INVITE_REDIRECT_URL=listacompras://convite` e as Redirect URLs
   do Supabase (`listacompras://**`).
9. Para cobrar: siga [billing.md](billing.md).
