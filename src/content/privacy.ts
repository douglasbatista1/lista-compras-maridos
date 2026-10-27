/**
 * Política de Privacidade — texto exibido em /privacidade (site e app).
 * Escrita a partir do que o app realmente faz em 27/10/2026. Ao mudar a coleta ou o uso de
 * dados (ex.: pagamentos, análises, ofertas por localização), atualize este texto e a data.
 *
 * PENDENTE antes de publicar na loja: preencher CONTROLLER e revisar com um profissional.
 */
export const CONTROLLER = {
  /** Nome da pessoa ou razão social responsável pelo app (e CNPJ, se houver). */
  name: '[a definir: nome ou razão social do responsável]',
  /** E-mail para pedidos de privacidade (direitos do titular). */
  email: '[a definir: e-mail de contato]',
};

export const PRIVACY_UPDATED_AT = '27 de outubro de 2026';

export type PrivacySection = { title: string; paragraphs: string[] };

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: 'Quem somos',
    paragraphs: [
      `O aplicativo Lista de Compras para Maridos ("app") é mantido por ${CONTROLLER.name}, que é o controlador dos dados pessoais tratados no app, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).`,
      `Para qualquer assunto de privacidade, escreva para ${CONTROLLER.email}.`,
    ],
  },
  {
    title: 'Quais dados coletamos',
    paragraphs: [
      'Conta: nome (como a família te chama), e-mail e senha. A senha é guardada de forma criptografada pelo nosso provedor de autenticação; nós não temos acesso a ela.',
      'Família: a família que você cria ou da qual participa, quem é o responsável e quem são os membros.',
      'Convites: o nome e o e-mail das pessoas que o responsável convida, usados apenas para enviar o convite e permitir que somente aquele e-mail aceite.',
      'Listas e compras: as listas que você cria, os produtos escolhidos (do catálogo ou cadastrados pela família), as quantidades, os itens marcados como comprados, as compras concluídas e as respectivas datas.',
      'Dados técnicos: registros de acesso gerados automaticamente pelos nossos provedores de infraestrutura (como endereço IP, data e hora), usados para segurança e para corrigir falhas.',
      'Não coletamos sua localização, seus contatos, fotos ou dados de pagamento. Não usamos ferramentas de publicidade nem rastreamento de terceiros.',
    ],
  },
  {
    title: 'Para que usamos os dados',
    paragraphs: [
      'Para criar e manter sua conta e sua família, mostrar as mesmas listas para todos os membros autorizados, enviar convites e e-mails de acesso (como redefinição de senha) e guardar o histórico de compras da família.',
      'Para segurança: impedir acessos indevidos e garantir que uma família nunca veja os dados de outra.',
      'Para melhorar o app: entender, de forma agregada, quais produtos e categorias são mais usados e onde a busca falha. Estatísticas desse tipo não identificam pessoas nem famílias.',
      'Não vendemos dados pessoais. Não compartilhamos o histórico de compras identificável de nenhuma família com supermercados, anunciantes ou outras empresas.',
    ],
  },
  {
    title: 'Bases legais (LGPD)',
    paragraphs: [
      'Execução de contrato (art. 7º, V): para oferecer as funções do app que você escolheu usar.',
      'Legítimo interesse (art. 7º, IX): para segurança e para as melhorias com estatísticas agregadas, sempre respeitando seus direitos e expectativas.',
      'Cumprimento de obrigação legal (art. 7º, II): quando a lei exigir guardar ou informar algum dado.',
    ],
  },
  {
    title: 'Com quem os dados são compartilhados',
    paragraphs: [
      'Somente com fornecedores que operam o app em nosso nome, sob contrato e para essas finalidades:',
      'Supabase — banco de dados, autenticação e armazenamento, com servidores em São Paulo (Brasil).',
      'Vercel — hospedagem do site do app.',
      'Provedor de envio de e-mails — envio de convites e e-mails de acesso.',
      'Apple e Google — distribuição do app e, quando houver, processamento de pagamentos nas lojas. Os dados de pagamento ficam com as lojas; não temos acesso a eles.',
      'Alguns desses fornecedores podem tratar dados fora do Brasil, com as garantias previstas na LGPD para transferência internacional.',
    ],
  },
  {
    title: 'Por quanto tempo guardamos',
    paragraphs: [
      'Enquanto sua conta existir. Os dados da família ficam disponíveis enquanto a família existir.',
      'Ao excluir uma lista concluída do seu histórico, ela deixa de aparecer para você, mas continua no histórico da família e em nossos registros de compras. Ela é apagada quando a conta ou a família é excluída.',
      'Quando você pedir a exclusão da conta, apagamos ou anonimizamos seus dados pessoais, exceto o que a lei nos obrigar a guardar.',
    ],
  },
  {
    title: 'Seus direitos',
    paragraphs: [
      'Você pode, a qualquer momento: confirmar se tratamos seus dados, acessá-los, corrigi-los, pedir a portabilidade, pedir a exclusão, saber com quem os compartilhamos e revogar consentimentos (art. 18 da LGPD).',
      `Para exercer esses direitos, escreva para ${CONTROLLER.email}. Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
    ],
  },
  {
    title: 'Segurança',
    paragraphs: [
      'A comunicação entre o app e nossos servidores é criptografada. Cada família só acessa os próprios dados, regra aplicada diretamente no banco de dados. As senhas são guardadas de forma criptografada pelo provedor de autenticação.',
      'Nenhum sistema é totalmente imune a incidentes. Se algum incidente puder trazer risco relevante a você, avisaremos você e a ANPD, conforme a lei.',
    ],
  },
  {
    title: 'Crianças e adolescentes',
    paragraphs: [
      'O app é destinado a adultos que organizam as compras da casa. Menores de idade só devem participar de uma família quando convidados pelo responsável legal, que responde por esse uso.',
    ],
  },
  {
    title: 'Armazenamento no aparelho',
    paragraphs: [
      'O app guarda no seu aparelho (ou no navegador) apenas o necessário para manter você conectado e para funcionar rápido. Não usamos cookies de publicidade ou rastreamento.',
    ],
  },
  {
    title: 'Mudanças nesta política',
    paragraphs: [
      'Podemos atualizar esta política quando o app mudar. A data no topo indica a última versão. Mudanças importantes serão avisadas no app.',
    ],
  },
];
