import type { Purchase } from './types';

/**
 * Reposição (experimental). Estima o intervalo médio entre compras confirmadas do
 * MESMO produto (mesmo id => mesma embalagem/tamanho). É uma estimativa de hábito de
 * compra, nunca uma medida de consumo, e só aparece com observações suficientes.
 */
export const MIN_PURCHASES = 3;

export type ReplenishmentEstimate = {
  key: string;
  name: string;
  sizeLabel: string | null;
  purchases: number;
  averageDays: number;
  lastPurchase: string;
  nextEstimate: string;
};

const DAY = 24 * 60 * 60 * 1000;

export function estimateReplenishment(purchases: Purchase[], minPurchases = MIN_PURCHASES): ReplenishmentEstimate[] {
  const byProduct = new Map<string, { name: string; sizeLabel: string | null; dates: number[] }>();
  for (const p of purchases) {
    const day = new Date(p.confirmedAt).getTime();
    for (const item of p.items) {
      const key = item.productId ?? item.familyProductId;
      if (!key || item.quantityPurchased <= 0) continue;
      const entry = byProduct.get(key) ?? { name: item.snapshot.name, sizeLabel: item.snapshot.sizeLabel, dates: [] };
      entry.dates.push(day);
      byProduct.set(key, entry);
    }
  }
  const out: ReplenishmentEstimate[] = [];
  for (const [key, e] of byProduct) {
    // compras no mesmo dia contam uma vez
    const days = [...new Set(e.dates.map((d) => Math.floor(d / DAY)))].sort((a, b) => a - b);
    if (days.length < minPurchases) continue;
    const gaps = days.slice(1).map((d, i) => d - days[i]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avg < 1) continue;
    const last = days[days.length - 1] * DAY;
    out.push({
      key,
      name: e.name,
      sizeLabel: e.sizeLabel,
      purchases: days.length,
      averageDays: Math.round(avg),
      lastPurchase: new Date(last).toISOString(),
      nextEstimate: new Date(last + avg * DAY).toISOString(),
    });
  }
  return out.sort((a, b) => a.nextEstimate.localeCompare(b.nextEstimate));
}
