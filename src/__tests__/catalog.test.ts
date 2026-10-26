import { getBundledCatalog } from '@/data/catalog/localCatalog';

/** Usa o catálogo real gerado de "Banco de produtos/" (assets/catalog/catalog.json). */
describe('catálogo real empacotado', () => {
  const catalog = getBundledCatalog();

  it('carrega todos os produtos importados', () => {
    expect(catalog.size()).toBe(11280);
    expect(catalog.departments()).toContain('Mercearia');
  });

  it('sugere café Pilão 500 g ao digitar sem acento e com espaço no tamanho', () => {
    const results = catalog.search('cafe pilao 500 g', { limit: 10 });
    expect(results.length).toBeGreaterThan(0);
    for (const p of results) {
      expect(p.name.toLowerCase()).toContain('pil');
      expect(p.sizeLabel).toBe('500 g');
    }
  });

  it('diferencia embalagens do mesmo produto', () => {
    const r5 = catalog.search('arroz giassi 5kg');
    const r1 = catalog.search('arroz giassi 1kg');
    expect(r5.length).toBeGreaterThan(0);
    expect(r1.length).toBeGreaterThan(0);
    expect(r5.some((p) => r1.some((q) => q.id === p.id))).toBe(false);
  });

  it('responde rápido o bastante para a busca enquanto digita', () => {
    catalog.search('a');
    const t0 = Date.now();
    for (const q of ['c', 'ca', 'caf', 'cafe', 'cafe p', 'cafe pi', 'cafe pil']) catalog.search(q);
    expect((Date.now() - t0) / 7).toBeLessThan(80);
  });
});
