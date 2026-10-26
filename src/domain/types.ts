/**
 * Modelos tipados usados pela interface. O modo local (demonstração) e o Supabase
 * implementam o mesmo contrato (ver src/data/repository.ts).
 *
 * Datas: sempre ISO 8601 em UTC (`new Date().toISOString()` / `timestamptz` no Postgres).
 * A interface converte para o fuso do aparelho só na exibição.
 */

export type SizeUnit = 'g' | 'kg' | 'mg' | 'ml' | 'l' | 'un' | 'cm' | 'm' | 'mm' | 'folhas' | 'capsulas';

/** Produto do catálogo global (somente leitura para o app). */
export type CatalogProduct = {
  kind: 'catalog';
  id: string;
  name: string;
  brand: string | null;
  variant: string | null;
  sizeLabel: string | null;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  packQty: number | null;
  department: string | null;
  category: string | null;
  gtin: string | null;
  imageUrl: string | null;
  /** Catálogo de demonstração inventado (fallback) — nunca é o caso do catálogo real importado. */
  isDemo?: boolean;
};

/** Produto cadastrado manualmente por uma família. Nunca entra no catálogo global. */
export type FamilyProduct = {
  kind: 'family';
  id: string;
  familyId: string;
  name: string;
  brand: string | null;
  variant: string | null;
  sizeLabel: string | null;
  category: string | null;
  note: string | null;
  imageUrl: string | null;
  createdAt: string;
};

export type AnyProduct = CatalogProduct | FamilyProduct;

export type ListStatus = 'active' | 'completed';
/** 'complete': produtos do catálogo (foto, marca, tamanho). 'simple': texto livre, sem foto. */
export type ListKind = 'complete' | 'simple';
export type ItemStatus = 'pending' | 'purchased';

/** Cópia de identificação do produto no momento em que entrou na lista. */
export type ProductSnapshot = {
  name: string;
  brand: string | null;
  variant: string | null;
  sizeLabel: string | null;
  category: string | null;
  imageUrl: string | null;
};

export type ShoppingListItem = {
  id: string;
  listId: string;
  productId: string | null;
  familyProductId: string | null;
  snapshot: ProductSnapshot;
  quantityRequested: number;
  /** null enquanto não comprado; pode diferir do pedido (ex.: faltou na loja). */
  quantityPurchased: number | null;
  status: ItemStatus;
  checkedAt: string | null;
  note: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type ShoppingList = {
  id: string;
  familyId: string;
  name: string;
  kind: ListKind;
  status: ListStatus;
  /** Lista de origem quando criada por "Comprar novamente". */
  sourceListId: string | null;
  /** Quando quem montou tocou em "Enviar lista" (pronta para ir ao mercado). */
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  items: ShoppingListItem[];
};

/** Compra confirmada: só existe quando a lista é concluída e confirmada. */
export type Purchase = {
  id: string;
  familyId: string;
  listId: string;
  listName: string;
  confirmedAt: string;
  items: PurchaseItem[];
};

export type PurchaseItem = {
  id: string;
  listItemId: string;
  productId: string | null;
  familyProductId: string | null;
  snapshot: ProductSnapshot;
  quantityPurchased: number;
};

export type Family = {
  id: string;
  name: string;
  role: 'owner' | 'member';
};

export type FamilyMember = {
  userId: string;
  displayName: string;
  role: 'owner' | 'member';
  status: 'active' | 'invited';
};

export type Progress = { done: number; total: number; ratio: number };
