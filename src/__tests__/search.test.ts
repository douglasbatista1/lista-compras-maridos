import { normalizeText, productSubtitle, searchProducts, toSearchable } from '@/domain/search';

import { arroz1, arroz5, cafe250, cafe500, cafeExtraForte, detergente, sampleProducts } from './helpers';

const index = sampleProducts.map((p) => toSearchable(p));
const ids = (q: string, opts = {}) => searchProducts(index, q, opts).map((p) => p.id);

describe('normalizeText', () => {
  it('ignora caixa, acentos e espaços extras', () => {
    expect(normalizeText('  CAFÉ   Pilão ')).toBe('cafe pilao');
  });
  it('trata "1 kg" e "1kg" (e vírgula decimal) como iguais', () => {
    expect(normalizeText('Arroz 1 KG')).toBe('arroz 1kg');
    expect(normalizeText('Óleo 1,5 L')).toBe('oleo 1.5l');
  });
});

describe('searchProducts', () => {
  it('encontra por nome, tolerando maiúsculas e acentos', () => {
    expect(ids('CAFE')).toEqual(expect.arrayContaining([cafe500.id, cafe250.id, cafeExtraForte.id]));
    expect(ids('cafe')).not.toContain(detergente.id);
  });

  it('encontra por marca', () => {
    expect(ids('ypê')).toEqual([detergente.id]);
    expect(ids('melitta')).toEqual([cafeExtraForte.id]);
  });

  it('encontra por variante e por tamanho, diferenciando embalagens', () => {
    expect(ids('extra forte')).toEqual([cafeExtraForte.id]);
    expect(ids('café pilão 250 g')).toEqual([cafe250.id]);
    expect(ids('arroz 5 kg')).toEqual([arroz5.id]);
    expect(ids('arroz 1kg')).toEqual([arroz1.id]);
  });

  it('exige todos os termos (não mistura produtos parecidos)', () => {
    expect(ids('pilão melitta')).toEqual([]);
  });

  it('prioriza correspondência no início do nome e marca exata', () => {
    expect(ids('pilao')[0]).toMatch(/p-cafe-(500|250)/);
    expect(ids('arroz')[0]).toMatch(/p-arroz/);
  });

  it('filtra por departamento', () => {
    expect(ids('', { department: 'Limpeza' })).toEqual([detergente.id]);
  });

  it('busca incremental: prefixos parciais já sugerem resultados', () => {
    expect(ids('caf')).toEqual(expect.arrayContaining([cafe500.id, cafe250.id]));
    expect(ids('deterg')).toEqual([detergente.id]);
  });

  it('usa sinônimos comuns (detergente encontra lava-louças)', () => {
    const lava = { ...detergente, id: 'p-lava', name: 'Lava-Louças Líquido Neutro Ypê Frasco 500ml' };
    const idx = [toSearchable(lava), ...index];
    expect(searchProducts(idx, 'detergente ype 500').map((p) => p.id)).toEqual(expect.arrayContaining(['p-lava', detergente.id]));
  });

  it('a lista de sinônimos do app é a mesma da migração SQL', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const terms: Record<string, string[]> = require('@/domain/synonyms.json').terms;
    const sql: string = readFileSync(join(__dirname, '../../supabase/migrations/20261022000300_search_synonyms.sql'), 'utf8');
    for (const [term, exps] of Object.entries(terms)) {
      expect(sql).toContain(`('${term}', array[${exps.map((e) => `'${e}'`).join(', ')}])`);
    }
  });

  it('linha de identificação mostra marca, variante e tamanho', () => {
    expect(productSubtitle({ brand: 'Pilão', variant: 'Tradicional', sizeLabel: '500 g' })).toBe('Pilão · Tradicional · 500 g');
  });
});
