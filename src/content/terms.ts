/**
 * Termos de Uso — texto exibido em /termos (site e app). Escritos a partir do que o app
 * faz em 27/10/2026. Ao ativar a cobrança ou mudar regras da família, atualize o texto e a data.
 */
import { CONTROLLER, type LegalSection } from './privacy';

export const TERMS_UPDATED_AT = '27 de outubro de 2026';

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: 'Sobre estes termos',
    paragraphs: [
      `Estes Termos de Uso valem para o aplicativo e o site Lista de Compras para Maridos ("app"), mantidos por ${CONTROLLER.name}. Ao criar uma conta ou usar o app, você concorda com eles e com a Política de Privacidade.`,
    ],
  },
  {
    title: 'O que o app faz',
    paragraphs: [
      'O app ajuda a família a montar listas de compras com o produto exato (foto, marca, variante e tamanho) ou com itens escritos à mão, compartilhar essas listas entre os membros da família e guardar o histórico das compras.',
      'O app não vende produtos, não mostra preços e não tem relação com nenhum supermercado. A compra acontece na loja que você escolher.',
    ],
  },
  {
    title: 'Conta e família',
    paragraphs: [
      'Para usar o app com sua família você cria uma conta com e-mail e senha. Mantenha a senha em segredo: o que for feito com a sua conta é de sua responsabilidade.',
      'Quem cria a família é o responsável. Ele pode convidar até 5 pessoas por e-mail, reenviar ou cancelar convites e remover pessoas. Convide apenas pessoas que concordem em receber o e-mail e participar da família.',
      'Todos os membros veem e podem alterar as listas da família. Não coloque nas listas informações que você não queira compartilhar com eles.',
      'Menores de 18 anos só devem usar o app quando convidados pelo responsável legal.',
    ],
  },
  {
    title: 'Catálogo de produtos',
    paragraphs: [
      'Os nomes, fotos, marcas e tamanhos do catálogo servem só para identificar o produto. As marcas pertencem aos seus donos e não há parceria ou patrocínio de nenhuma delas.',
      'O catálogo pode ter erros ou produtos que não existem mais. Confira o produto na loja antes de comprar. Se algo estiver errado, avise pelo e-mail de contato.',
    ],
  },
  {
    title: 'Pagamento',
    paragraphs: [
      'Hoje o app pode ser usado sem pagamento. Quando a cobrança for ativada, o preço e o que ele libera aparecerão no app e na loja antes da compra, e nada será cobrado sem a sua confirmação.',
      'Compras feitas pela App Store ou pelo Google Play são processadas pela própria loja e seguem as regras dela, inclusive para reembolso. O acesso comprado vale para a família de quem comprou.',
    ],
  },
  {
    title: 'Uso permitido',
    paragraphs: [
      'Não use o app para enviar conteúdo ilegal ou ofensivo, para mandar convites a quem não pediu, para tentar acessar dados de outras famílias ou para atrapalhar o funcionamento do serviço.',
      'Podemos suspender contas que violem estas regras, avisando o motivo sempre que possível.',
    ],
  },
  {
    title: 'Excluir a conta',
    paragraphs: [
      'Você pode excluir sua conta a qualquer momento no app, em Família → Excluir minha conta. O que acontece com os dados está descrito na Política de Privacidade.',
    ],
  },
  {
    title: 'Disponibilidade e responsabilidade',
    paragraphs: [
      'Trabalhamos para manter o app funcionando e os dados seguros, mas ele pode ficar fora do ar por manutenção ou falhas de fornecedores. Faremos o possível para avisar com antecedência as mudanças importantes.',
      'O app é uma ferramenta de organização. Não respondemos por compras erradas, faltas de produto ou diferenças de preço nas lojas. Nada nestes termos limita os direitos que você tem pelo Código de Defesa do Consumidor.',
    ],
  },
  {
    title: 'Mudanças e contato',
    paragraphs: [
      'Podemos atualizar estes termos quando o app mudar. A data no topo indica a última versão, e mudanças importantes serão avisadas no app.',
      `Estes termos seguem as leis do Brasil. Dúvidas, sugestões ou reclamações: ${CONTROLLER.email}.`,
    ],
  },
];
