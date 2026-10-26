import { randomUUID } from 'node:crypto';

import type { Clock } from '@/domain/lists';
import type { CatalogProduct } from '@/domain/types';
import type { KeyValueStore } from '@/data/local/localRepository';

export function testClock(start = Date.parse('2026-10-01T12:00:00Z')): Clock & { advanceDays: (d: number) => void } {
  let t = start;
  return {
    newId: () => randomUUID(),
    now: () => new Date((t += 1000)).toISOString(),
    advanceDays: (d: number) => {
      t += d * 24 * 60 * 60 * 1000;
    },
  };
}

export function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
}

export function product(p: Partial<CatalogProduct> & Pick<CatalogProduct, 'id' | 'name'>): CatalogProduct {
  return {
    kind: 'catalog',
    brand: null,
    variant: null,
    sizeLabel: null,
    sizeValue: null,
    sizeUnit: null,
    packQty: null,
    department: 'Mercearia',
    category: null,
    gtin: null,
    imageUrl: null,
    ...p,
  };
}

export const cafe500 = product({ id: 'p-cafe-500', name: 'Café Torrado e Moído Tradicional Pilão Vácuo 500g', brand: 'Pilão', sizeLabel: '500 g', category: 'Matinal' });
export const cafe250 = product({ id: 'p-cafe-250', name: 'Café Torrado e Moído Tradicional Pilão Pacote 250g', brand: 'Pilão', sizeLabel: '250 g', category: 'Matinal' });
export const cafeExtraForte = product({ id: 'p-cafe-ef', name: 'Café Torrado e Moído Extra Forte Melitta 500g', brand: 'Melitta', sizeLabel: '500 g', category: 'Matinal' });
export const detergente = product({ id: 'p-det', name: 'Detergente Líquido Neutro Ypê 500ml', brand: 'Ypê', sizeLabel: '500 ml', department: 'Limpeza', category: 'Cozinha' });
export const arroz5 = product({ id: 'p-arroz-5', name: 'Arroz Branco Tipo 1 Tio João 5kg', brand: 'Tio João', sizeLabel: '5 kg', category: 'Alimentos Básicos' });
export const arroz1 = product({ id: 'p-arroz-1', name: 'Arroz Branco Tipo 1 Tio João 1kg', brand: 'Tio João', sizeLabel: '1 kg', category: 'Alimentos Básicos' });

export const sampleProducts = [cafe500, cafe250, cafeExtraForte, detergente, arroz5, arroz1];
