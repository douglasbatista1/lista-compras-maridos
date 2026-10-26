# Roadmap

## Fase 1 — MVP (este trabalho)
- [x] Listas, busca incremental no catálogo real, checklist com progresso, histórico e "comprar novamente"
- [x] Produto particular da família
- [x] Modo demonstração local, com aviso visível
- [x] Esquema Supabase com RLS, RPCs e teste de isolamento
- [x] Importação idempotente do catálogo
- [x] Configuração do EAS e exportação web opcional
- [ ] Criar o projeto Supabase do app, aplicar as migrações e importar (precisa da sua decisão; ver o README)

## Fase 2 — Contas e sincronização reais
- Testar login por código, família, convite e Realtime contra o projeto real
- Cache offline do modo Supabase: fila local de alterações enquanto o aparelho está sem rede
- Exclusão e exportação de conta (LGPD), política de privacidade e termos

### Convites por e-mail (implementado em 22/10/2026; envio real ainda não verificado)
Edge Function `invite-member` publicada em 22/10/2026 no projeto `lista-compras-maridos` (exige login; chamada sem usuário não cria convite: verificado). Pendente: configurar o SMTP e as Redirect URLs no painel, depois testar o link num celular com o app instalado. Melhorias futuras: convidado que já tem conta e outra família (hoje ele usa o código); links universais (https) em vez de `listacompras://`.

Regras implementadas:

- **Quem convida:** o responsável pela família (quem comprou o app).
- **Limite:** até **5 pessoas além do responsável** (6 por família). O limite é verificado no servidor. Exemplos de uso: filhos, cônjuge, quem trabalha na casa.
- **Dados do convite:** só **nome e e-mail**, nas colunas `name` e `email` de `family_invites`.
- **Envio:** uma Edge Function do Supabase (`invite-member`) confere se quem pede é o responsável e se o limite não foi atingido. Depois chama `auth.admin.inviteUserByEmail(email, { data: { display_name, invite_code }, redirectTo })`. A chave secreta fica só na Edge Function, nunca no app.
- **E-mail:** o servidor de e-mail padrão do Supabase serve só para teste, porque tem limite baixo de envios por hora. Em produção, configure um SMTP próprio (Resend, Brevo, Amazon SES etc.) com domínio verificado (SPF/DKIM).
- **Cadastro do convidado:** abre o link → o app (ou uma página web de fallback) pede para **criar a senha** → entra direto na família.
- **Login:** e-mail + senha, com "esqueci minha senha". O código por e-mail continua como alternativa.
- **Gestão:** o responsável vê os convites pendentes, pode reenviar, cancelar e remover membros.

Para funcionar de verdade, é preciso: projeto Supabase do app, conta no provedor de e-mail com domínio verificado e (opcional) um domínio para links web.

## Fase 3 — Catálogo
- Revisão de licença das fotos e fotos próprias ou licenciadas
- Revisão das 43 possíveis duplicatas e dos 21 grupos iguais; campo `variant` estruturado; aliases
- Desativar produtos que saíram da origem (`is_active`); outras fontes de catálogo, sem depender de uma rede só

## Fase 4 — Ofertas por localização (requer aprovação, parceiro e revisão jurídica)
Modelo planejado (ainda não criado):
- `retailers`: empresa parceira
- `stores`: loja física, endereço e coordenadas
- `offers`: loja, campanha, `starts_at`, `ends_at`, condições, status e marcação "Patrocinado"
- `offer_products`: produtos da oferta
- `offer_events`: impressão, abertura, adição à lista e resgate, com coleta mínima

Regras:
- Localização só em primeiro plano, opcional e não guardada. Sem permissão, o usuário escolhe a cidade ou loja manualmente.
- No máximo um aviso discreto, com limite de frequência e fácil de dispensar. Nunca altera a lista sem toque explícito.
- Ofertas expiradas não aparecem. Preço e desconto não são inventados. Resgate só conta com validação do parceiro.
- **Nenhum banner no checklist.** Teste controlado de um espaço "Patrocinado" em áreas secundárias, medindo retenção, conclusão de listas, dispensas e conversão.
- Busca orgânica sem anúncios misturados nos resultados.

## Fase 5 — Monetização
- R$ 10 por família, pagamento único. Usar a compra dentro do app (IAP) das lojas ou um provedor permitido pelas regras de cada loja, com validação no servidor (webhook → `entitlements`). Hoje é só demonstrativo.

## Reposição (experimental, já visível)
Intervalo médio entre compras confirmadas do mesmo produto e tamanho, com pelo menos 3 compras em dias diferentes, sempre apresentado como estimativa de hábito de compra. Próximo passo: notificações opcionais.

## Métricas do MVP (sem tracking extra)
Derivadas das próprias tabelas: listas criadas/concluídas, itens marcados, tempo até concluir, recompras. Eventos que precisariam de registro novo e opcional:
- `busca_sem_resultado` (termo normalizado, sem usuário) — para melhorar o catálogo e os sinônimos;
- `produto_adicionado_via_busca`.

Não registrar eventos ligados a uma pessoa sem finalidade documentada.
