import type { AnyProduct, Family, ListKind, FamilyMember, FamilyProduct, Purchase, ShoppingList } from '@/domain/types';

/**
 * Contrato único de acesso a dados. A interface só conversa com este contrato;
 * o modo local (demonstração, AsyncStorage) e o Supabase o implementam.
 */
export type NewFamilyProduct = {
  name: string;
  brand?: string | null;
  variant?: string | null;
  sizeLabel?: string | null;
  category?: string | null;
  note?: string | null;
};

export type SearchOptions = { department?: string | null; limit?: number };

export interface DataRepository {
  readonly mode: 'local' | 'supabase';

  // Catálogo global + produtos particulares da família atual
  searchProducts(query: string, opts?: SearchOptions): Promise<AnyProduct[]>;
  listDepartments(): Promise<string[]>;
  createFamilyProduct(input: NewFamilyProduct): Promise<FamilyProduct>;

  // Usuário e família
  getDisplayName(): Promise<string>;
  setDisplayName(name: string): Promise<void>;
  getFamily(): Promise<Family | null>;
  listMembers(): Promise<FamilyMember[]>;

  // Listas
  listLists(status: 'active' | 'completed'): Promise<ShoppingList[]>;
  getList(id: string): Promise<ShoppingList | null>;
  createList(name: string, kind?: ListKind): Promise<ShoppingList>;
  renameList(listId: string, name: string): Promise<ShoppingList>;
  sendList(listId: string): Promise<ShoppingList>;
  /**
   * Lista não concluída: apagada de vez ('deleted').
   * Lista concluída: some só do histórico de quem pediu ('hidden'); lista e compra
   * continuam guardadas no banco.
   */
  deleteList(listId: string): Promise<'deleted' | 'hidden'>;
  addProduct(listId: string, product: AnyProduct, quantity: number): Promise<ShoppingList>;
  /** Lista simples: item de texto livre (sem produto do catálogo e sem foto). */
  addTextItem(listId: string, text: string, quantity: number): Promise<ShoppingList>;
  setQuantity(listId: string, itemId: string, quantity: number): Promise<ShoppingList>;
  removeItem(listId: string, itemId: string): Promise<ShoppingList>;
  toggleItem(listId: string, itemId: string): Promise<ShoppingList>;
  completeList(listId: string): Promise<Purchase>;
  cloneList(listId: string, name: string): Promise<ShoppingList>;

  // Histórico
  listPurchases(): Promise<Purchase[]>;
}
