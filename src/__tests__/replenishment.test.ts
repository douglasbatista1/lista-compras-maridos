import { estimateReplenishment } from '@/domain/replenishment';
import type { Purchase } from '@/domain/types';

function purchase(day: string, productId: string, qty = 1): Purchase {
  return {
    id: `p-${day}-${productId}`,
    familyId: 'fam-a',
    listId: 'l',
    listName: 'Semana',
    confirmedAt: `${day}T15:00:00Z`,
    items: [
      {
        id: `i-${day}`,
        listItemId: 'x',
        productId,
        familyProductId: null,
        snapshot: { name: 'Café Pilão', brand: 'Pilão', variant: null, sizeLabel: '500 g', category: null, imageUrl: null },
        quantityPurchased: qty,
      },
    ],
  };
}

describe('reposição (experimental)', () => {
  it('não estima com poucas observações', () => {
    expect(estimateReplenishment([purchase('2026-09-01', 'cafe'), purchase('2026-09-15', 'cafe')])).toEqual([]);
  });

  it('estima intervalo médio com compras suficientes do mesmo produto/tamanho', () => {
    const [e] = estimateReplenishment([
      purchase('2026-09-01', 'cafe'),
      purchase('2026-09-15', 'cafe'),
      purchase('2026-09-29', 'cafe'),
    ]);
    expect(e).toMatchObject({ key: 'cafe', purchases: 3, averageDays: 14 });
    expect(e.nextEstimate.slice(0, 10)).toBe('2026-10-13');
  });

  it('não mistura tamanhos diferentes (ids diferentes)', () => {
    expect(
      estimateReplenishment([purchase('2026-09-01', 'cafe-500'), purchase('2026-09-15', 'cafe-250'), purchase('2026-09-29', 'cafe-500')]),
    ).toEqual([]);
  });
});
