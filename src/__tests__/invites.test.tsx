/**
 * Convites por e-mail no app: repositório (Edge Function + plano B sem e-mail) e a tela da
 * aba Família. O Supabase é simulado; o SQL real é testado em scripts/db/rls_isolation_test.sql.
 */
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FamilyPeople } from '@/components/FamilyPeople';
import { SupabaseRepository, type PendingInvite } from '@/data/supabase/supabaseRepository';

const metrics = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const render = (ui: ReactElement) => rtlRender(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

jest.mock('@/data/supabase/client', () => ({ publicImageUrl: (p: string | null) => p, getSupabase: () => null }));

function fakeSb(invoke: () => Promise<{ data: unknown; error: unknown }>) {
  const rpc = jest.fn(async (fn: string) => ({ data: fn === 'create_family_invite' ? 'MANUAL01' : 'RENEW001', error: null }));
  return { sb: { functions: { invoke: jest.fn(invoke) }, rpc } as any, rpc };
}
const family = { id: 'fam-a', name: 'Casa', role: 'owner' as const };

describe('SupabaseRepository.inviteMember', () => {
  it('usa a Edge Function e devolve se o e-mail foi enviado', async () => {
    const { sb, rpc } = fakeSb(async () => ({ data: { code: 'K7M2Q9XA', emailSent: true }, error: null }));
    const res = await new SupabaseRepository(sb, family).inviteMember(' João ', ' Joao@Exemplo.com ');
    expect(res).toEqual({ code: 'K7M2Q9XA', emailSent: true });
    expect(sb.functions.invoke).toHaveBeenCalledWith('invite-member', {
      body: { action: 'create', familyId: 'fam-a', name: 'João', email: 'joao@exemplo.com' },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('mostra a mensagem de regra que a função devolveu (ex.: limite)', async () => {
    const response = new Response(JSON.stringify({ error: 'Limite atingido: a família pode ter até 5 pessoas além do responsável' }), { status: 400 });
    const { sb } = fakeSb(async () => ({ data: null, error: new FunctionsHttpError(response) }));
    await expect(new SupabaseRepository(sb, family).inviteMember('X', 'x@exemplo.com')).rejects.toThrow(/Limite atingido/);
  });

  it('sem a função publicada, cria o convite direto no banco e devolve o código para compartilhar', async () => {
    const { sb, rpc } = fakeSb(async () => ({ data: null, error: new FunctionsFetchError('falha') }));
    const res = await new SupabaseRepository(sb, family).inviteMember('Ana', 'ana@exemplo.com');
    expect(res).toEqual({ code: 'MANUAL01', emailSent: false, reason: 'email_service_unavailable' });
    expect(rpc).toHaveBeenCalledWith('create_family_invite', { p_family: 'fam-a', p_name: 'Ana', p_email: 'ana@exemplo.com' });
  });
});

function fakeRepo(over: Partial<Record<string, jest.Mock>> = {}) {
  const pending: PendingInvite[] = [
    { id: 'i1', name: 'Filha', email: 'filha@exemplo.com', code: 'AAAA1111', expiresAt: '2026-10-29T00:00:00Z', emailSentAt: '2026-10-22T00:00:00Z', expired: false },
  ];
  return {
    listInvites: jest.fn(async () => pending),
    inviteSlots: jest.fn(async () => 3),
    inviteMember: jest.fn(async () => ({ code: 'BBBB2222', emailSent: true })),
    resendInvite: jest.fn(),
    revokeInvite: jest.fn(async () => {}),
    removeMember: jest.fn(async () => {}),
    ...over,
  } as unknown as SupabaseRepository;
}

const members = [
  { userId: 'u1', displayName: 'Ana', role: 'owner' as const, status: 'active' as const },
  { userId: 'u2', displayName: 'Beto', role: 'member' as const, status: 'active' as const },
];

describe('aba Família: convidar pessoas', () => {
  it('mostra vagas, envia convite por nome + e-mail e lista pendentes', async () => {
    const repo = fakeRepo();
    await render(<FamilyPeople repo={repo} isOwner members={members} onChanged={() => {}} />);
    expect(await screen.findByText(/convidar mais 3 de 5 pessoas/)).toBeTruthy();
    expect(screen.getByText('Filha')).toBeTruthy();

    const send = screen.getByRole('button', { name: 'Enviar convite' });
    expect(send.props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'João');
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'joao@exemplo.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(repo.inviteMember).toHaveBeenCalledWith('João', 'joao@exemplo.com');
    expect(await screen.findByText(/Convite enviado para joao@exemplo.com/)).toBeTruthy();
  });

  it('quem já tem conta recebe o código para digitar', async () => {
    const repo = fakeRepo({ inviteMember: jest.fn(async () => ({ code: 'CCCC3333', emailSent: false, reason: 'already_registered' })) });
    await render(<FamilyPeople repo={repo} isOwner members={members} onChanged={() => {}} />);
    await fireEvent.changeText(await screen.findByLabelText('Nome'), 'Vó');
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'vo@exemplo.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(await screen.findByText('CCCC3333')).toBeTruthy();
    expect(screen.getByText(/já tem conta/)).toBeTruthy();
  });

  it('com limite atingido, não deixa enviar', async () => {
    const repo = fakeRepo({ inviteSlots: jest.fn(async () => 0) });
    await render(<FamilyPeople repo={repo} isOwner members={members} onChanged={() => {}} />);
    expect(await screen.findByText(/Limite de 5 pessoas atingido/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Sexto');
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'sexto@exemplo.com');
    expect(screen.getByRole('button', { name: 'Enviar convite' }).props.accessibilityState.disabled).toBe(true);
  });

  it('cancelar convite e remover membro pedem confirmação', async () => {
    const repo = fakeRepo();
    const onChanged = jest.fn();
    await render(<FamilyPeople repo={repo} isOwner members={members} onChanged={onChanged} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Convite para Filha' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancelar convite' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancelar convite' }));
    expect(repo.revokeInvite).toHaveBeenCalledWith('i1');

    await fireEvent.press(screen.getByText('Beto'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remover da família' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remover' }));
    expect(repo.removeMember).toHaveBeenCalledWith('u2');
    expect(onChanged).toHaveBeenCalled();
  });

  it('membro comum não vê o formulário', async () => {
    await render(<FamilyPeople repo={fakeRepo()} isOwner={false} members={members} onChanged={() => {}} />);
    expect(screen.getByText(/Apenas o responsável/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enviar convite' })).toBeNull();
  });
});
