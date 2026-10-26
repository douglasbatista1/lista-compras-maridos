/**
 * Fluxo principal navegando pelas telas reais (Expo Router), em modo demonstração,
 * com o catálogo real empacotado.
 */
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

const routes = {
  _layout: require('@/app/_layout').default,
  '(tabs)/_layout': require('@/app/(tabs)/_layout').default,
  '(tabs)/index': require('@/app/(tabs)/index').default,
  '(tabs)/catalogo': require('@/app/(tabs)/catalogo').default,
  '(tabs)/historico': require('@/app/(tabs)/historico').default,
  '(tabs)/familia': require('@/app/(tabs)/familia').default,
  'lista/nova': require('@/app/lista/nova').default,
  'lista/[id]/index': require('@/app/lista/[id]/index').default,
  'lista/[id]/adicionar': require('@/app/lista/[id]/adicionar').default,
  'produto-manual': require('@/app/produto-manual').default,
  'historico/[id]': require('@/app/historico/[id]').default,
  entrar: require('@/app/entrar').default,
  'familia-inicial': require('@/app/familia-inicial').default,
};

jest.setTimeout(30000);

it('cria lista, escolhe quantidade, envia, marca, conclui e usa o menu de segurar para excluir', async () => {
  await renderRouter(routes, { initialUrl: '/' });

  expect(await screen.findByText('Nenhuma lista ativa')).toBeTruthy();
  expect(screen.getByText(/Modo demonstração/)).toBeTruthy();

  // nome na saudação
  await fireEvent.changeText(screen.getByLabelText('Seu nome'), 'Ana');
  await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
  expect(await screen.findByText(/, Ana!$/)).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Nova lista' }));
  await fireEvent.changeText(await screen.findByLabelText('Nome da lista'), 'Compras da semana');
  await fireEvent.press(screen.getByRole('button', { name: 'Criar e adicionar produtos' }));

  // busca incremental com o catálogo real; quantidade 2 antes de adicionar
  const search = await screen.findByLabelText('Buscar produtos');
  await fireEvent.changeText(search, 'cafe pilao 500');
  const plus = await screen.findAllByRole('button', { name: /^Aumentar quantidade de Café/ }, { timeout: 4000 });
  await fireEvent.press(plus[0]);
  await fireEvent.press(screen.getAllByRole('button', { name: /^Adicionar 2 Café/ })[0]);
  expect(await screen.findByText(/2× .* adicionado a "Compras da semana"/)).toBeTruthy();
  // só o campo é limpo; as opções continuam na tela, já mostrando o que entrou na lista
  expect(screen.getByLabelText('Buscar produtos').props.value).toBe('');
  expect(screen.getByText(/Resultados de “cafe pilao 500”/)).toBeTruthy();
  expect(screen.getAllByText(/Já na lista: 2/).length).toBe(1);
  expect(screen.getAllByRole('button', { name: /^Adicionar 1 Café/ }).length).toBeGreaterThan(0);

  // nenhum resultado -> oferece cadastro manual
  await fireEvent.changeText(screen.getByLabelText('Buscar produtos'), 'produtoquenaoexiste');
  expect(await screen.findByText(/Nada encontrado/, {}, { timeout: 4000 })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cadastrar produto' })).toBeTruthy();

  // enviar lista volta ao início com a lista pronta
  await fireEvent.press(screen.getByRole('button', { name: 'Enviar lista' }));
  expect(await screen.findByText('Pronta para comprar')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Abrir Compras da semana' }));
  const item = await screen.findByRole('checkbox');
  expect(screen.getByText('0 de 1 item comprado')).toBeTruthy();
  expect(screen.getByText(/Qtd\. 2/)).toBeTruthy();

  await fireEvent.press(item);
  expect(await screen.findByText('1 de 1 item comprado')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Concluir compra' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Confirmar' }));
  expect(await screen.findByText(/Compra confirmada em/)).toBeTruthy();
  expect(screen.getByText('COMPRADOS (1)')).toBeTruthy();

  // a tela da compra não tem mais o botão de excluir
  expect(screen.queryByRole('button', { name: 'Excluir do meu histórico' })).toBeNull();

  // no Histórico: tocar e segurar -> excluir do meu histórico (some só para o usuário)
  await act(async () => router.navigate('/historico'));
  const card = await screen.findByRole('button', { name: /^Compras da semana,/ });
  await fireEvent(card, 'longPress');
  await fireEvent.press(await screen.findByRole('button', { name: 'Excluir do meu histórico' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Excluir' }));
  expect(await screen.findByText('Nenhuma compra concluída')).toBeTruthy();

  // na tela inicial: tocar e segurar -> excluir lista não concluída
  await act(async () => router.navigate('/'));
  await fireEvent.press(await screen.findByRole('button', { name: 'Nova lista' }));
  await fireEvent.changeText(await screen.findByLabelText('Nome da lista'), 'Rascunho');
  await fireEvent.press(screen.getByRole('button', { name: 'Criar e adicionar produtos' }));
  await act(async () => router.navigate('/'));
  await fireEvent(await screen.findByRole('button', { name: 'Abrir Rascunho' }), 'longPress');
  expect(screen.getByRole('button', { name: 'Editar lista' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Excluir lista' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Excluir' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Abrir Rascunho' })).toBeNull());
  await act(async () => {});
});

it('lista simples: escreve os itens, escolhe a quantidade e marca, sem busca nem fotos', async () => {
  await renderRouter(routes, { initialUrl: '/lista/nova' });

  await fireEvent.changeText(await screen.findByLabelText('Nome da lista'), 'Feira de sábado');
  await fireEvent.press(screen.getByRole('radio', { name: /^Lista simples/ }));
  await fireEvent.press(screen.getByRole('button', { name: 'Criar lista simples' }));

  // vai direto para a lista, com o campo de escrever item (sem tela de busca)
  const input = await screen.findByLabelText('Novo item da lista');
  expect(screen.queryByLabelText('Buscar produtos')).toBeNull();

  await fireEvent.changeText(input, 'Pão francês');
  await fireEvent.press(screen.getByRole('button', { name: 'Aumentar quantidade do item' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Adicionar item' }));
  expect(await screen.findByText('Pão francês')).toBeTruthy();
  expect(screen.getByText(/Qtd\. 2/)).toBeTruthy();
  // campo limpo para o próximo item
  expect(screen.getByLabelText('Novo item da lista').props.value).toBe('');

  await fireEvent.changeText(screen.getByLabelText('Novo item da lista'), 'Banana prata');
  await fireEvent(screen.getByLabelText('Novo item da lista'), 'submitEditing', { nativeEvent: { text: 'Banana prata' } });
  expect(await screen.findByText('Banana prata')).toBeTruthy();
  expect(screen.getByText('0 de 2 itens comprados')).toBeTruthy();

  await fireEvent.press(screen.getByRole('checkbox', { name: /^Banana prata/ }));
  expect(await screen.findByText('1 de 2 itens comprados')).toBeTruthy();
  // lista simples não tem o botão de buscar produtos no catálogo
  expect(screen.queryByRole('button', { name: 'Adicionar' })).toBeNull();
  await act(async () => {});
});
