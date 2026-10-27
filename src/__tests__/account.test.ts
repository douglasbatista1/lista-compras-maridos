/**
 * Exclusão de conta e acesso da família no app. O SQL real (passar a responsabilidade,
 * apagar a família de uma pessoa só, webhook da loja) é testado em scripts/db/rls_isolation_test.sql.
 */
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { SupabaseRepository } from '@/data/supabase/supabaseRepository';
import { familyAccess } from '@/domain/access';
import { DELETE_CONFIRMATION, accountDeletionImpact } from '@/domain/auth';

jest.mock('@/data/supabase/client', () => ({ publicImageUrl: (p: string | null) => p, getSupabase: () => null }));

const family = { id: 'fam-a', name: 'Casa', role: 'owner' as const };

describe('accountDeletionImpact', () => {
  it('sozinho na família: a família é apagada', () => {
    expect(accountDeletionImpact('owner', 1)).toBe('delete-family');
  });
  it('responsável com outras pessoas: a responsabilidade passa adiante', () => {
    expect(accountDeletionImpact('owner', 3)).toBe('transfer-ownership');
  });
  it('membro comum: só sai da família', () => {
    expect(accountDeletionImpact('member', 2)).toBe('leave-family');
  });
});

describe('SupabaseRepository.deleteAccount', () => {
  it('chama a Edge Function com a confirmação', async () => {
    const invoke = jest.fn(async () => ({ data: { deleted: true }, error: null }));
    await new SupabaseRepository({ functions: { invoke } } as any, family).deleteAccount();
    expect(invoke).toHaveBeenCalledWith('delete-account', { body: { confirm: DELETE_CONFIRMATION } });
  });

  it('mostra a mensagem de erro da função', async () => {
    const response = new Response(JSON.stringify({ error: 'Sessão inválida. Entre de novo e tente outra vez.' }), { status: 401 });
    const invoke = jest.fn(async () => ({ data: null, error: new FunctionsHttpError(response) }));
    await expect(new SupabaseRepository({ functions: { invoke } } as any, family).deleteAccount()).rejects.toThrow(/Sessão inválida/);
  });

  it('sem conexão, não finge que excluiu', async () => {
    const invoke = jest.fn(async () => ({ data: null, error: new FunctionsFetchError('falha') }));
    await expect(new SupabaseRepository({ functions: { invoke } } as any, family).deleteAccount()).rejects.toThrow(/Sem conexão/);
  });
});

describe('familyAccess', () => {
  it('cortesia vale mais que compra', () => {
    expect(familyAccess([{ status: 'active', provider: 'revenuecat' }, { status: 'active', provider: 'courtesy' }])).toBe('courtesy');
  });
  it('compra ativa libera; reembolsada ou revogada não', () => {
    expect(familyAccess([{ status: 'active', provider: 'revenuecat' }])).toBe('paid');
    expect(familyAccess([{ status: 'refunded', provider: 'revenuecat' }])).toBe('free');
    expect(familyAccess([{ status: 'revoked', provider: 'courtesy' }])).toBe('free');
    expect(familyAccess([])).toBe('free');
  });
});
