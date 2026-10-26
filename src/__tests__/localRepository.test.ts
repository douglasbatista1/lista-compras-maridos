import { LocalCatalog, type CompactCatalog } from '@/data/catalog/localCatalog';
import { LocalRepository } from '@/data/local/localRepository';

import { cafe250, cafe500, detergente, memoryStore, testClock } from './helpers';

const compact: CompactCatalog = {
  version: 1,
  source: 'teste',
  imageBase: 'https://cdn.exemplo/ids/',
  departments: ['Limpeza', 'Mercearia'],
  products: [cafe500, cafe250, detergente].map((p) => [
    p.id, p.name, p.brand, p.sizeLabel, null, null, null, p.department === 'Limpeza' ? 0 : 1, p.category, null, '123/foto.png',
  ]),
};

function setup(store = memoryStore(), familyId = 'fam-a') {
  const catalog = new LocalCatalog(() => compact);
  return { store, catalog, repo: new LocalRepository(store, catalog, testClock(), familyId) };
}

describe('LocalRepository (modo demonstração)', () => {
  it('salva a lista e a recupera numa nova sessão do app', async () => {
    const { store, repo } = setup();
    const list = await repo.createList('Compras da semana');
    const [hit] = await repo.searchProducts('cafe 500g');
    await repo.addProduct(list.id, hit, 2);
    const again = new LocalRepository(store, new LocalCatalog(() => compact), testClock(), 'fam-a');
    const loaded = await again.getList(list.id);
    expect(loaded?.items).toHaveLength(1);
    expect(loaded?.items[0]).toMatchObject({ productId: cafe500.id, quantityRequested: 2 });
  });

  it('busca sugere o produto correto e monta a URL da miniatura', async () => {
    const { repo } = setup();
    const results = await repo.searchProducts('PILÃO 250');
    expect(results.map((r) => r.id)).toEqual([cafe250.id]);
    expect(results[0].imageUrl).toBe('https://cdn.exemplo/ids/123-240-240/foto.png');
  });

  it('cadastro manual fica particular à família e não entra no catálogo global', async () => {
    const store = memoryStore();
    const a = setup(store, 'fam-a');
    const b = setup(store, 'fam-b');
    const own = await a.repo.createFamilyProduct({ name: 'Pão da Padaria Sol', brand: 'Padaria Sol' });
    expect(own).toMatchObject({ kind: 'family', familyId: 'fam-a' });
    expect((await a.repo.searchProducts('padaria sol')).map((p) => p.id)).toEqual([own.id]);
    expect(await b.repo.searchProducts('padaria sol')).toEqual([]);
    expect(a.catalog.search('padaria sol')).toEqual([]);
    expect(a.catalog.size()).toBe(3);
    const listB = await b.repo.createList('Lista B');
    await expect(b.repo.addProduct(listB.id, own, 1)).rejects.toThrow(/outra família/);
    expect(await b.repo.getList((await a.repo.createList('Lista A')).id)).toBeNull();
  });

  it('concluir move a lista para o histórico e "comprar novamente" cria outra', async () => {
    const { repo } = setup();
    let list = await repo.createList('Semana');
    list = await repo.addProduct(list.id, cafe500, 1);
    list = await repo.addProduct(list.id, detergente, 1);
    list = await repo.toggleItem(list.id, list.items[0].id);
    const purchase = await repo.completeList(list.id);
    expect(await repo.listLists('active')).toHaveLength(0);
    expect(await repo.listLists('completed')).toHaveLength(1);
    expect((await repo.listPurchases()).map((p) => p.id)).toEqual([purchase.id]);
    const clone = await repo.cloneList(list.id, 'Semana 2');
    expect((await repo.listLists('active')).map((l) => l.id)).toEqual([clone.id]);
    expect((await repo.getList(list.id))?.status).toBe('completed');
  });

  it('excluir: lista não concluída some de vez; concluída só sai do histórico e fica guardada', async () => {
    const { store, repo } = setup();
    const draft = await repo.createList('Rascunho');
    expect(await repo.deleteList(draft.id)).toBe('deleted');
    expect(await repo.getList(draft.id)).toBeNull();
    expect(store.data.get('lcm:v1:family:fam-a')).not.toContain(draft.id);

    let done = await repo.createList('Semana');
    done = await repo.addProduct(done.id, cafe500, 1);
    done = await repo.toggleItem(done.id, done.items[0].id);
    const purchase = await repo.completeList(done.id);
    expect(await repo.deleteList(done.id)).toBe('hidden');
    expect(await repo.listLists('completed')).toEqual([]);
    expect(await repo.listPurchases()).toEqual([]);
    const raw = store.data.get('lcm:v1:family:fam-a')!;
    expect(raw).toContain(done.id);
    expect(raw).toContain(purchase.id);
  });

  it('lista simples é salva com o tipo e os itens de texto', async () => {
    const { store, repo } = setup();
    const list = await repo.createList('Feira', 'simple');
    await repo.addTextItem(list.id, 'Tomate', 3);
    const again = new LocalRepository(store, new LocalCatalog(() => compact), testClock(), 'fam-a');
    const loaded = await again.getList(list.id);
    expect(loaded).toMatchObject({ kind: 'simple' });
    expect(loaded?.items.map((i) => [i.snapshot.name, i.quantityRequested])).toEqual([['Tomate', 3]]);
  });

  it('listas antigas (antes do tipo existir) abrem como completas', async () => {
    const store = memoryStore();
    store.data.set(
      'lcm:v1:family:fam-a',
      JSON.stringify({ version: 1, lists: [{ id: 'l1', familyId: 'fam-a', name: 'Antiga', status: 'active', items: [], updatedAt: '2026-10-01T00:00:00Z' }], purchases: [], familyProducts: [] }),
    );
    const { repo } = setup(store);
    expect((await repo.getList('l1'))?.kind).toBe('complete');
  });

  it('guarda o nome do usuário', async () => {
    const { repo } = setup();
    expect(await repo.getDisplayName()).toBe('');
    await repo.setDisplayName('  Ana Souza ');
    expect(await repo.getDisplayName()).toBe('Ana Souza');
  });

  it('ignora dado local corrompido sem travar', async () => {
    const store = memoryStore();
    store.data.set('lcm:v1:family:fam-a', '{corrompido');
    const { repo } = setup(store);
    expect(await repo.listLists('active')).toEqual([]);
  });
});
