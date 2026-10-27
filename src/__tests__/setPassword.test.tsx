/** Tela aberta pelo link do e-mail de convite: cria a senha e entra na família. */
import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SetPasswordScreen } from '@/components/SetPasswordScreen';

const metrics = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const render = (ui: ReactElement) => rtlRender(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

let mockUrl: string | null = null;
const mockReload = jest.fn(async () => {});
const mockReplace = jest.fn();
const mockProfileEq = jest.fn(async () => ({ error: null }));
const mockSb = {
  auth: {
    setSession: jest.fn(async () => ({ error: null })),
    verifyOtp: jest.fn(async (_: unknown) => ({ data: {}, error: null as null | { code: string; message: string } })),
    getUser: jest.fn(async () => ({ data: { user: { id: 'u-new', user_metadata: { display_name: 'João', invite_code: 'K7M2Q9XA' } } } })),
    updateUser: jest.fn(async () => ({ data: { user: { id: 'u-new' } }, error: null })),
  },
  from: jest.fn(() => ({ update: jest.fn(() => ({ eq: mockProfileEq })) })),
  rpc: jest.fn(async () => ({ data: 'fam-a', error: null })),
};

jest.mock('@/data/supabase/client', () => ({ getSupabase: () => mockSb, publicImageUrl: () => null }));
jest.mock('@/data/DataProvider', () => ({ useData: () => ({ reloadSession: mockReload }) }));
jest.mock('expo-linking', () => ({ useLinkingURL: () => mockUrl, createURL: (p: string) => `listacompras://${p}` }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { replace: (...a: unknown[]) => mockReplace(...a) } }));

beforeEach(() => jest.clearAllMocks());

it('convidado abre o link, cria a senha e entra na família', async () => {
  mockUrl = 'listacompras://convite?code=K7M2Q9XA#access_token=AAA&refresh_token=RRR&type=invite';
  await render(<SetPasswordScreen kind="invite" />);
  expect(await screen.findByText('Bem-vindo(a)!')).toBeTruthy();
  expect(mockSb.auth.setSession).toHaveBeenCalledWith({ access_token: 'AAA', refresh_token: 'RRR' });
  expect(screen.getByLabelText('Seu nome').props.value).toBe('João');

  await fireEvent.changeText(screen.getByLabelText('Senha (mínimo 8, com letras e números)'), 'curta1');
  await fireEvent.changeText(screen.getByLabelText('Confirme a senha'), 'curta1');
  await fireEvent.press(screen.getByRole('button', { name: 'Criar senha e entrar' }));
  expect(await screen.findByText(/pelo menos 8 caracteres/)).toBeTruthy();
  expect(mockSb.auth.updateUser).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Senha (mínimo 8, com letras e números)'), 'senhaBoa123');
  await fireEvent.changeText(screen.getByLabelText('Confirme a senha'), 'senhaBoa123');
  await fireEvent.press(screen.getByRole('button', { name: 'Criar senha e entrar' }));
  expect(mockSb.auth.updateUser).toHaveBeenCalledWith({ password: 'senhaBoa123', data: { display_name: 'João' } });
  expect(mockSb.rpc).toHaveBeenCalledWith('accept_family_invite', { p_code: 'K7M2Q9XA' });
  expect(mockReload).toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('link novo (token_hash): abrir não gasta o convite; o token só é usado ao criar a senha', async () => {
  mockUrl = 'https://lista.exemplo/convite?code=K7M2Q9XA&token_hash=hash123&type=invite';
  await render(<SetPasswordScreen kind="invite" />);
  expect(await screen.findByText('Bem-vindo(a)!')).toBeTruthy();
  expect(mockSb.auth.verifyOtp).not.toHaveBeenCalled();
  expect(mockSb.auth.setSession).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Seu nome'), 'Ana');
  await fireEvent.changeText(screen.getByLabelText('Senha (mínimo 8, com letras e números)'), 'senhaBoa123');
  await fireEvent.changeText(screen.getByLabelText('Confirme a senha'), 'senhaBoa123');
  await fireEvent.press(screen.getByRole('button', { name: 'Criar senha e entrar' }));
  expect(mockSb.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash123', type: 'invite' });
  expect(mockSb.auth.updateUser).toHaveBeenCalledWith({ password: 'senhaBoa123', data: { display_name: 'Ana' } });
  expect(mockSb.rpc).toHaveBeenCalledWith('accept_family_invite', { p_code: 'K7M2Q9XA' });
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('link novo já usado: explica e mostra o código para entrar pelo login', async () => {
  mockUrl = 'https://lista.exemplo/convite?code=K7M2Q9XA&token_hash=usado&type=invite';
  mockSb.auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: { code: 'otp_expired', message: 'Token has expired or is invalid' } });
  await render(<SetPasswordScreen kind="invite" />);
  await fireEvent.changeText(await screen.findByLabelText('Senha (mínimo 8, com letras e números)'), 'senhaBoa123');
  await fireEvent.changeText(screen.getByLabelText('Confirme a senha'), 'senhaBoa123');
  await fireEvent.press(screen.getByRole('button', { name: 'Criar senha e entrar' }));
  expect(await screen.findByText('Link expirado')).toBeTruthy();
  expect(screen.getByText(/já foi usado ou expirou.*código K7M2Q9XA/)).toBeTruthy();
  expect(mockSb.auth.updateUser).not.toHaveBeenCalled();
});

it('link expirado mostra como pedir outro', async () => {
  mockUrl = 'listacompras://convite?code=K7M2Q9XA#error=access_denied&error_description=Email+link+is+invalid+or+has+expired';
  await render(<SetPasswordScreen kind="invite" />);
  expect(await screen.findByText('Link expirado')).toBeTruthy();
  expect(screen.getByText(/Reenviar/)).toBeTruthy();
  expect(mockSb.auth.setSession).not.toHaveBeenCalled();
});
