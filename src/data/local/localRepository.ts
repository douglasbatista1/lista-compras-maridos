import * as Domain from '@/domain/lists';
import { searchProducts, toSearchable } from '@/domain/search';
import type { AnyProduct, Family, FamilyMember, FamilyProduct, ListKind, Purchase, ShoppingList } from '@/domain/types';

import type { LocalCatalog } from '../catalog/localCatalog';
import type { DataRepository, NewFamilyProduct, SearchOptions } from '../repository';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** `hiddenAt`: removida do histórico deste aparelho, mas mantida no armazenamento. */
type StoredList = ShoppingList & { hiddenAt?: string | null };

type LocalState = {
  version: 1;
  displayName?: string;
  lists: StoredList[];
  purchases: Purchase[];
  familyProducts: FamilyProduct[];
};

const emptyState = (): LocalState => ({ version: 1, lists: [], purchases: [], familyProducts: [] });

export const LOCAL_FAMILY_ID = 'local-family';

function stripLocal({ hiddenAt: _hidden, ...list }: StoredList): ShoppingList {
  return list;
}

/**
 * Modo demonstração: tudo fica neste aparelho (AsyncStorage). Não há conta,
 * convite real nem sincronização — a interface deixa isso explícito.
 */
export class LocalRepository implements DataRepository {
  readonly mode = 'local' as const;
  private state: LocalState | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: KeyValueStore,
    private readonly catalog: LocalCatalog,
    private readonly clock: Domain.Clock,
    private readonly familyId: string = LOCAL_FAMILY_ID,
  ) {}

  private get key() {
    return `lcm:v1:family:${this.familyId}`;
  }

  private async load(): Promise<LocalState> {
    if (this.state) return this.state;
    const raw = await this.store.getItem(this.key);
    let parsed: LocalState = emptyState();
    if (raw) {
      try {
        const data = JSON.parse(raw) as LocalState;
        if (data?.version === 1) {
          parsed = { ...emptyState(), ...data };
          // dados gravados antes do campo sentAt existir
          parsed.lists = parsed.lists.map((l) => ({ ...l, sentAt: l.sentAt ?? null, kind: l.kind ?? 'complete' }));
        }
      } catch {
        // dado corrompido: começa vazio em vez de travar o app
      }
    }
    this.state = parsed;
    return parsed;
  }

  /** Grava em série para que duas ações rápidas não sobrescrevam uma à outra. */
  private async save(next: LocalState): Promise<void> {
    this.state = next;
    const payload = JSON.stringify(next);
    this.writing = this.writing.then(() => this.store.setItem(this.key, payload));
    await this.writing;
  }

  private async updateList(listId: string, fn: (l: ShoppingList) => ShoppingList): Promise<ShoppingList> {
    const s = await this.load();
    const current = s.lists.find((l) => l.id === listId);
    if (!current) throw new Error('Lista não encontrada.');
    const updated = fn(current);
    await this.save({ ...s, lists: s.lists.map((l) => (l.id === listId ? updated : l)) });
    return updated;
  }

  async searchProducts(query: string, opts: SearchOptions = {}): Promise<AnyProduct[]> {
    const s = await this.load();
    const own = opts.department
      ? []
      : searchProducts(
          s.familyProducts.filter((p) => p.familyId === this.familyId).map((p) => toSearchable(p)),
          query,
          { limit: 10 },
        );
    const catalog = this.catalog.search(query, opts);
    return [...own, ...catalog].slice(0, opts.limit ?? 40);
  }

  async listDepartments(): Promise<string[]> {
    return this.catalog.departments();
  }

  async createFamilyProduct(input: NewFamilyProduct): Promise<FamilyProduct> {
    const name = input.name.trim();
    if (!name) throw new Error('Informe o nome do produto.');
    const s = await this.load();
    const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);
    const product: FamilyProduct = {
      kind: 'family',
      id: this.clock.newId(),
      familyId: this.familyId,
      name: name.slice(0, 120),
      brand: clean(input.brand),
      variant: clean(input.variant),
      sizeLabel: clean(input.sizeLabel),
      category: clean(input.category),
      note: clean(input.note),
      imageUrl: null,
      createdAt: this.clock.now(),
    };
    await this.save({ ...s, familyProducts: [...s.familyProducts, product] });
    return product;
  }

  async getDisplayName(): Promise<string> {
    return (await this.load()).displayName ?? '';
  }

  async setDisplayName(name: string): Promise<void> {
    const s = await this.load();
    await this.save({ ...s, displayName: name.trim().slice(0, 80) });
  }

  async getFamily(): Promise<Family> {
    return { id: this.familyId, name: 'Minha família (neste aparelho)', role: 'owner' };
  }

  async listMembers(): Promise<FamilyMember[]> {
    const name = (await this.load()).displayName;
    return [{ userId: 'local-user', displayName: name ? `${name} (neste aparelho)` : 'Você (neste aparelho)', role: 'owner', status: 'active' }];
  }

  async listLists(status: 'active' | 'completed'): Promise<ShoppingList[]> {
    const s = await this.load();
    const key = status === 'completed' ? 'completedAt' : 'updatedAt';
    return s.lists
      .filter((l) => l.familyId === this.familyId && l.status === status && !l.hiddenAt)
      .sort((a, b) => (b[key] ?? '').localeCompare(a[key] ?? ''))
      .map(stripLocal);
  }

  async getList(id: string): Promise<ShoppingList | null> {
    const s = await this.load();
    const list = s.lists.find((l) => l.id === id && l.familyId === this.familyId);
    return list ? stripLocal(list) : null;
  }

  async createList(name: string, kind: ListKind = 'complete'): Promise<ShoppingList> {
    const s = await this.load();
    const list = Domain.createList(this.familyId, name, this.clock, null, kind);
    await this.save({ ...s, lists: [...s.lists, list] });
    return list;
  }

  renameList(listId: string, name: string) {
    return this.updateList(listId, (l) => Domain.renameList(l, name, this.clock));
  }

  sendList(listId: string) {
    return this.updateList(listId, (l) => Domain.sendList(l, this.clock));
  }

  async deleteList(listId: string): Promise<'deleted' | 'hidden'> {
    const s = await this.load();
    const list = s.lists.find((l) => l.id === listId);
    if (!list) throw new Error('Lista não encontrada.');
    if (list.status === 'completed') {
      const hiddenAt = this.clock.now();
      await this.save({ ...s, lists: s.lists.map((l) => (l.id === listId ? { ...l, hiddenAt } : l)) });
      return 'hidden';
    }
    await this.save({ ...s, lists: s.lists.filter((l) => l.id !== listId) });
    return 'deleted';
  }

  addProduct(listId: string, product: AnyProduct, quantity: number) {
    if (product.kind === 'family' && product.familyId !== this.familyId) {
      return Promise.reject(new Error('Produto particular de outra família.'));
    }
    return this.updateList(listId, (l) => Domain.addProduct(l, product, quantity, this.clock));
  }

  addTextItem(listId: string, text: string, quantity: number) {
    return this.updateList(listId, (l) => Domain.addTextItem(l, text, quantity, this.clock));
  }

  setQuantity(listId: string, itemId: string, quantity: number) {
    return this.updateList(listId, (l) => Domain.setQuantity(l, itemId, quantity, this.clock));
  }

  removeItem(listId: string, itemId: string) {
    return this.updateList(listId, (l) => Domain.removeItem(l, itemId, this.clock));
  }

  toggleItem(listId: string, itemId: string) {
    return this.updateList(listId, (l) => Domain.toggleItem(l, itemId, this.clock));
  }

  async completeList(listId: string): Promise<Purchase> {
    const s = await this.load();
    const current = s.lists.find((l) => l.id === listId);
    if (!current) throw new Error('Lista não encontrada.');
    const { list, purchase } = Domain.completeList(current, this.clock);
    await this.save({
      ...s,
      lists: s.lists.map((l) => (l.id === listId ? list : l)),
      purchases: [purchase, ...s.purchases],
    });
    return purchase;
  }

  async cloneList(listId: string, name: string): Promise<ShoppingList> {
    const s = await this.load();
    const source = s.lists.find((l) => l.id === listId);
    if (!source) throw new Error('Lista não encontrada.');
    const clone = Domain.cloneList(source, name, this.clock);
    await this.save({ ...s, lists: [...s.lists, clone] });
    return clone;
  }

  async listPurchases(): Promise<Purchase[]> {
    const s = await this.load();
    const hidden = new Set(s.lists.filter((l) => l.hiddenAt).map((l) => l.id));
    return s.purchases
      .filter((p) => p.familyId === this.familyId && !hidden.has(p.listId))
      .sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
  }
}
