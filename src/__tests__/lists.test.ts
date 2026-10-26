import * as L from '@/domain/lists';

import { cafe250, cafe500, detergente, testClock } from './helpers';

describe('regras das listas', () => {
  const clock = testClock();

  it('cria e edita uma lista', () => {
    const list = L.createList('fam-a', '  Compras da semana ', clock);
    expect(list).toMatchObject({ name: 'Compras da semana', status: 'active', familyId: 'fam-a', items: [] });
    expect(L.renameList(list, 'Feira', clock).name).toBe('Feira');
    expect(() => L.createList('fam-a', '   ', clock)).toThrow();
  });

  it('adiciona produtos guardando snapshot e soma quantidade do mesmo produto', () => {
    let list = L.createList('fam-a', 'Semana', clock);
    list = L.addProduct(list, cafe500, 1, clock);
    list = L.addProduct(list, cafe500, 2, clock);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].quantityRequested).toBe(3);
    expect(list.items[0].snapshot).toMatchObject({ name: cafe500.name, brand: 'Pilão', sizeLabel: '500 g' });
  });

  it('não mistura tamanhos diferentes (250 g x 500 g)', () => {
    let list = L.createList('fam-a', 'Semana', clock);
    list = L.addProduct(list, cafe500, 1, clock);
    list = L.addProduct(list, cafe250, 1, clock);
    expect(list.items.map((i) => i.snapshot.sizeLabel)).toEqual(['500 g', '250 g']);
  });

  it('marca/desmarca e recalcula o progresso', () => {
    let list = L.createList('fam-a', 'Semana', clock);
    list = L.addProduct(list, cafe500, 2, clock);
    list = L.addProduct(list, detergente, 1, clock);
    expect(L.progressOf(list)).toEqual({ done: 0, total: 2, ratio: 0 });
    const id = list.items[0].id;
    list = L.toggleItem(list, id, clock);
    expect(L.progressOf(list)).toEqual({ done: 1, total: 2, ratio: 0.5 });
    expect(list.items[0]).toMatchObject({ status: 'purchased', quantityPurchased: 2 });
    expect(list.items[0].checkedAt).not.toBeNull();
    list = L.toggleItem(list, id, clock);
    expect(L.progressOf(list).done).toBe(0);
    expect(list.items[0]).toMatchObject({ status: 'pending', quantityPurchased: null, checkedAt: null });
  });

  it('distingue quantidade pedida de quantidade comprada', () => {
    let list = L.createList('fam-a', 'Semana', clock);
    list = L.addProduct(list, cafe500, 3, clock);
    list = L.toggleItem(list, list.items[0].id, clock);
    list = L.setPurchasedQuantity(list, list.items[0].id, 2, clock);
    expect(list.items[0]).toMatchObject({ quantityRequested: 3, quantityPurchased: 2 });
  });

  it('concluir gera compra só com itens marcados e preserva a lista original', () => {
    let list = L.createList('fam-a', 'Semana', clock);
    list = L.addProduct(list, cafe500, 1, clock);
    list = L.addProduct(list, detergente, 1, clock);
    expect(() => L.completeList(list, clock)).toThrow(/pelo menos um item/);
    list = L.toggleItem(list, list.items[0].id, clock);
    const before = JSON.parse(JSON.stringify(list));
    const { list: done, purchase } = L.completeList(list, clock);
    expect(list).toEqual(before); // imutável
    expect(done.status).toBe('completed');
    expect(done.completedAt).not.toBeNull();
    expect(done.items).toHaveLength(2); // o não comprado continua registrado na lista
    expect(purchase.items).toHaveLength(1);
    expect(purchase.items[0].snapshot.name).toBe(cafe500.name);
    expect(() => L.addProduct(done, cafe250, 1, clock)).toThrow(/concluída/);
  });

  it('"comprar novamente" cria nova lista com novos IDs, sem alterar a original', () => {
    let list = L.createList('fam-a', 'Semana', clock);
    list = L.addProduct(list, cafe500, 2, clock);
    list = L.addProduct(list, detergente, 1, clock);
    list = L.toggleItem(list, list.items[0].id, clock);
    const { list: done } = L.completeList(list, clock);
    const clone = L.cloneList(done, 'Semana (de novo)', clock);
    expect(clone.id).not.toBe(done.id);
    expect(clone.sourceListId).toBe(done.id);
    expect(clone.status).toBe('active');
    const oldIds = new Set(done.items.map((i) => i.id));
    expect(clone.items.every((i) => !oldIds.has(i.id) && i.listId === clone.id)).toBe(true);
    expect(clone.items.every((i) => i.status === 'pending' && i.quantityPurchased === null)).toBe(true);
    expect(clone.items.map((i) => i.quantityRequested)).toEqual([2, 1]);
    expect(done.status).toBe('completed');
  });

  it('enviar lista exige itens e registra o envio', () => {
    let list = L.createList('fam-a', 'Semana', clock);
    expect(list.sentAt).toBeNull();
    expect(() => L.sendList(list, clock)).toThrow(/pelo menos um produto/);
    list = L.addProduct(list, cafe500, 1, clock);
    list = L.sendList(list, clock);
    expect(list.sentAt).not.toBeNull();
    expect(L.cloneList(list, 'Nova', clock).sentAt).toBeNull();
  });

  it('lista simples: itens de texto livre, sem produto nem foto; mesmo texto soma a quantidade', () => {
    let list = L.createList('fam-a', 'Feira', clock, null, 'simple');
    expect(list.kind).toBe('simple');
    expect(L.createList('fam-a', 'Semana', clock).kind).toBe('complete');
    list = L.addTextItem(list, '  Pão   francês ', 6, clock);
    list = L.addTextItem(list, 'PAO FRANCES', 2, clock);
    list = L.addTextItem(list, 'Banana prata', 1, clock);
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toMatchObject({ productId: null, familyProductId: null, quantityRequested: 8 });
    expect(list.items[0].snapshot).toEqual({ name: 'Pão francês', brand: null, variant: null, sizeLabel: null, category: null, imageUrl: null });
    expect(() => L.addTextItem(list, '   ', 1, clock)).toThrow(/Escreva/);
    list = L.toggleItem(list, list.items[1].id, clock);
    const { purchase } = L.completeList(list, clock);
    expect(purchase.items.map((i) => i.snapshot.name)).toEqual(['Banana prata']);
    expect(L.cloneList(list, 'Feira 2', clock).kind).toBe('simple');
  });

  it('checklist mostra pendentes antes dos comprados', () => {
    let list = L.createList('fam-a', 'Semana', clock);
    list = L.addProduct(list, cafe500, 1, clock);
    list = L.addProduct(list, detergente, 1, clock);
    list = L.toggleItem(list, list.items[0].id, clock);
    expect(L.checklistOrder(list.items).map((i) => i.snapshot.name)).toEqual([detergente.name, cafe500.name]);
  });
});
