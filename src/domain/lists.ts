import { normalizeText } from './search';
import type {
  AnyProduct,
  ListKind,
  ProductSnapshot,
  Progress,
  Purchase,
  ShoppingList,
  ShoppingListItem,
} from './types';

/**
 * Regras puras das listas. Não acessam armazenamento: recebem o estado e devolvem
 * um novo estado (imutável), o que facilita testar e reaproveitar no modo local.
 */
export type Clock = { newId: () => string; now: () => string };

export function snapshotOf(product: AnyProduct): ProductSnapshot {
  return {
    name: product.name,
    brand: product.brand,
    variant: product.variant,
    sizeLabel: product.sizeLabel,
    category: product.category,
    imageUrl: product.imageUrl,
  };
}

export function createList(
  familyId: string,
  name: string,
  clock: Clock,
  sourceListId: string | null = null,
  kind: ListKind = 'complete',
): ShoppingList {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Dê um nome para a lista.');
  const now = clock.now();
  return {
    id: clock.newId(),
    familyId,
    name: trimmed.slice(0, 80),
    kind,
    status: 'active',
    sourceListId,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    items: [],
  };
}

function assertActive(list: ShoppingList) {
  if (list.status !== 'active') throw new Error('Esta lista já foi concluída e faz parte do histórico.');
}

function touch(list: ShoppingList, clock: Clock, items: ShoppingListItem[]): ShoppingList {
  return { ...list, items, updatedAt: clock.now() };
}

/**
 * Adiciona um produto. Se o MESMO produto (mesmo id, logo mesmo tamanho/variante)
 * já estiver na lista, soma a quantidade em vez de duplicar. Produtos de tamanhos
 * diferentes têm ids diferentes e nunca são mesclados.
 */
export function addProduct(list: ShoppingList, product: AnyProduct, quantity: number, clock: Clock): ShoppingList {
  assertActive(list);
  const qty = sanitizeQuantity(quantity);
  const productId = product.kind === 'catalog' ? product.id : null;
  const familyProductId = product.kind === 'family' ? product.id : null;
  const existing = list.items.find(
    (i) => (productId && i.productId === productId) || (familyProductId && i.familyProductId === familyProductId),
  );
  const now = clock.now();
  if (existing) {
    return touch(
      list,
      clock,
      list.items.map((i) =>
        i.id === existing.id ? { ...i, quantityRequested: sanitizeQuantity(i.quantityRequested + qty), updatedAt: now } : i,
      ),
    );
  }
  const item: ShoppingListItem = {
    id: clock.newId(),
    listId: list.id,
    productId,
    familyProductId,
    snapshot: snapshotOf(product),
    quantityRequested: qty,
    quantityPurchased: null,
    status: 'pending',
    checkedAt: null,
    note: null,
    position: list.items.length,
    createdAt: now,
    updatedAt: now,
  };
  return touch(list, clock, [...list.items, item]);
}

/**
 * Lista simples: item só com o texto que a pessoa escreveu. O mesmo texto (sem diferença
 * de maiúsculas e acentos) soma a quantidade em vez de duplicar.
 */
export function addTextItem(list: ShoppingList, text: string, quantity: number, clock: Clock): ShoppingList {
  assertActive(list);
  const name = text.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!name) throw new Error('Escreva o que precisa comprar.');
  const qty = sanitizeQuantity(quantity);
  const key = normalizeText(name);
  const now = clock.now();
  const existing = list.items.find((i) => !i.productId && !i.familyProductId && normalizeText(i.snapshot.name) === key);
  if (existing) {
    return touch(
      list,
      clock,
      list.items.map((i) =>
        i.id === existing.id ? { ...i, quantityRequested: sanitizeQuantity(i.quantityRequested + qty), updatedAt: now } : i,
      ),
    );
  }
  const item: ShoppingListItem = {
    id: clock.newId(),
    listId: list.id,
    productId: null,
    familyProductId: null,
    snapshot: { name, brand: null, variant: null, sizeLabel: null, category: null, imageUrl: null },
    quantityRequested: qty,
    quantityPurchased: null,
    status: 'pending',
    checkedAt: null,
    note: null,
    position: list.items.length,
    createdAt: now,
    updatedAt: now,
  };
  return touch(list, clock, [...list.items, item]);
}

export function sanitizeQuantity(q: number): number {
  if (!Number.isFinite(q) || q <= 0) return 1;
  return Math.min(Math.round(q * 1000) / 1000, 999);
}

export function setQuantity(list: ShoppingList, itemId: string, quantity: number, clock: Clock): ShoppingList {
  assertActive(list);
  const now = clock.now();
  return touch(
    list,
    clock,
    list.items.map((i) => (i.id === itemId ? { ...i, quantityRequested: sanitizeQuantity(quantity), updatedAt: now } : i)),
  );
}

export function removeItem(list: ShoppingList, itemId: string, clock: Clock): ShoppingList {
  assertActive(list);
  return touch(
    list,
    clock,
    list.items.filter((i) => i.id !== itemId).map((i, idx) => ({ ...i, position: idx })),
  );
}

/** Marca/desmarca. Ao marcar, assume comprada a quantidade pedida (pode ser ajustada depois). */
export function toggleItem(list: ShoppingList, itemId: string, clock: Clock): ShoppingList {
  assertActive(list);
  const now = clock.now();
  return touch(
    list,
    clock,
    list.items.map((i) => {
      if (i.id !== itemId) return i;
      return i.status === 'purchased'
        ? { ...i, status: 'pending', quantityPurchased: null, checkedAt: null, updatedAt: now }
        : { ...i, status: 'purchased', quantityPurchased: i.quantityRequested, checkedAt: now, updatedAt: now };
    }),
  );
}

export function setPurchasedQuantity(list: ShoppingList, itemId: string, quantity: number, clock: Clock): ShoppingList {
  assertActive(list);
  const now = clock.now();
  return touch(
    list,
    clock,
    list.items.map((i) =>
      i.id === itemId && i.status === 'purchased'
        ? { ...i, quantityPurchased: Math.max(0, Math.min(quantity, 999)), updatedAt: now }
        : i,
    ),
  );
}

export function renameList(list: ShoppingList, name: string, clock: Clock): ShoppingList {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Dê um nome para a lista.');
  return { ...list, name: trimmed.slice(0, 80), updatedAt: clock.now() };
}

/** "Enviar lista": sinaliza que a lista está pronta para quem vai comprar. */
export function sendList(list: ShoppingList, clock: Clock): ShoppingList {
  assertActive(list);
  if (list.items.length === 0) throw new Error('Adicione pelo menos um produto antes de enviar.');
  const now = clock.now();
  return { ...list, sentAt: now, updatedAt: now };
}

export function progressOf(list: Pick<ShoppingList, 'items'>): Progress {
  const total = list.items.length;
  const done = list.items.filter((i) => i.status === 'purchased').length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

/**
 * Conclui a lista e gera o registro de compra confirmada. Só os itens marcados
 * entram na compra; a lista original é preservada (status "completed").
 */
export function completeList(list: ShoppingList, clock: Clock): { list: ShoppingList; purchase: Purchase } {
  assertActive(list);
  const purchased = list.items.filter((i) => i.status === 'purchased');
  if (purchased.length === 0) throw new Error('Marque pelo menos um item comprado antes de concluir.');
  const now = clock.now();
  const done: ShoppingList = { ...list, status: 'completed', completedAt: now, updatedAt: now };
  const purchase: Purchase = {
    id: clock.newId(),
    familyId: list.familyId,
    listId: list.id,
    listName: list.name,
    confirmedAt: now,
    items: purchased.map((i) => ({
      id: clock.newId(),
      listItemId: i.id,
      productId: i.productId,
      familyProductId: i.familyProductId,
      snapshot: i.snapshot,
      quantityPurchased: i.quantityPurchased ?? i.quantityRequested,
    })),
  };
  return { list: done, purchase };
}

/**
 * "Comprar novamente": nova lista com novos IDs, itens pendentes e mesma quantidade
 * pedida. A lista de origem não é alterada.
 */
export function cloneList(source: ShoppingList, name: string, clock: Clock): ShoppingList {
  const base = createList(source.familyId, name, clock, source.id, source.kind);
  const now = clock.now();
  return {
    ...base,
    items: source.items.map((i, idx) => ({
      ...i,
      id: clock.newId(),
      listId: base.id,
      status: 'pending' as const,
      quantityPurchased: null,
      checkedAt: null,
      position: idx,
      createdAt: now,
      updatedAt: now,
    })),
  };
}

/** Ordem do checklist: pendentes primeiro (na ordem em que foram adicionados), depois comprados. */
export function checklistOrder(items: ShoppingListItem[]): ShoppingListItem[] {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    return a.position - b.position;
  });
}
