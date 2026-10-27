/**
 * Acesso da família (compra única pelas lojas, via RevenueCat → webhook → entitlements).
 * Por enquanto a cobrança não está ativa: nada no app é bloqueado, só mostramos a situação.
 */
export type FamilyAccess = 'courtesy' | 'paid' | 'free';

export type EntitlementRow = { status: string; provider: string | null };

export function familyAccess(rows: EntitlementRow[]): FamilyAccess {
  const active = rows.filter((r) => r.status === 'active');
  if (active.some((r) => r.provider === 'courtesy')) return 'courtesy';
  if (active.length > 0) return 'paid';
  return 'free';
}

export const ACCESS_LABEL: Record<FamilyAccess, { badge: string; text: string }> = {
  courtesy: { badge: 'Cortesia', text: 'Acesso liberado para todas as pessoas da família, sem pagamento.' },
  paid: { badge: 'Comprado', text: 'Acesso comprado. Vale para todas as pessoas da família.' },
  free: {
    badge: 'Gratuito',
    text: 'O app está gratuito durante os testes. Quando a cobrança começar, o valor aparece aqui antes de qualquer pagamento.',
  },
};
