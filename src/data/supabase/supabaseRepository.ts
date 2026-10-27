import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

import { type EntitlementRow, type FamilyAccess, familyAccess } from '@/domain/access';
import { DELETE_CONFIRMATION, normalizeEmail } from '@/domain/auth';
import { normalizeText } from '@/domain/search';
import type {
  AnyProduct,
  CatalogProduct,
  Family,
  FamilyMember,
  FamilyProduct,
  ListKind,
  Purchase,
  ShoppingList,
  ShoppingListItem,
  SizeUnit,
} from '@/domain/types';

import type { DataRepository, NewFamilyProduct, SearchOptions } from '../repository';
import { publicImageUrl } from './client';

/**
 * Implementação com Supabase. A segurança real está no banco (RLS + RPCs);
 * aqui só montamos as consultas. Status: implementada, mas só verificável com um
 * projeto Supabase configurado (ver docs/architecture.md).
 */

type Row = Record<string, any>;

export type PendingInvite = {
  id: string;
  name: string | null;
  email: string | null;
  code: string;
  expiresAt: string;
  emailSentAt: string | null;
  expired: boolean;
};

export type InviteResult = {
  code: string;
  emailSent: boolean;
  reason?: 'already_registered' | 'email_service_unavailable';
};

const ITEM_COLUMNS =
  'id, list_id, product_id, family_product_id, name_snapshot, brand_snapshot, variant_snapshot, size_label_snapshot, category_snapshot, image_ref_snapshot, quantity_requested, quantity_purchased, status, checked_at, note, position, created_at, updated_at';
const LIST_COLUMNS = `id, family_id, name, kind, status, source_list_id, sent_at, created_at, updated_at, completed_at, items:shopping_list_items(${ITEM_COLUMNS})`;

function fail(error: { message: string } | null, fallback = 'Não foi possível concluir. Verifique a conexão e tente de novo.') {
  if (error) throw new Error(error.message || fallback);
}

function mapProduct(r: Row): CatalogProduct {
  return {
    kind: 'catalog',
    id: r.id,
    name: r.name,
    brand: r.brand,
    variant: r.variant,
    sizeLabel: r.size_label,
    sizeValue: r.size_value === null ? null : Number(r.size_value),
    sizeUnit: r.size_unit as SizeUnit | null,
    packQty: r.pack_qty,
    department: r.department,
    category: r.category,
    gtin: r.gtin,
    imageUrl: publicImageUrl(r.image_path),
  };
}

function mapFamilyProduct(r: Row): FamilyProduct {
  return {
    kind: 'family',
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    brand: r.brand,
    variant: r.variant,
    sizeLabel: r.size_label,
    category: r.category,
    note: r.note,
    imageUrl: publicImageUrl(r.image_path),
    createdAt: r.created_at,
  };
}

function mapItem(r: Row): ShoppingListItem {
  return {
    id: r.id,
    listId: r.list_id,
    productId: r.product_id,
    familyProductId: r.family_product_id,
    snapshot: {
      name: r.name_snapshot,
      brand: r.brand_snapshot,
      variant: r.variant_snapshot,
      sizeLabel: r.size_label_snapshot,
      category: r.category_snapshot,
      imageUrl: publicImageUrl(r.image_ref_snapshot),
    },
    quantityRequested: Number(r.quantity_requested),
    quantityPurchased: r.quantity_purchased === null ? null : Number(r.quantity_purchased),
    status: r.status,
    checkedAt: r.checked_at,
    note: r.note,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapList(r: Row): ShoppingList {
  return {
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    status: r.status === 'completed' ? 'completed' : 'active',
    kind: r.kind === 'simple' ? 'simple' : 'complete',
    sourceListId: r.source_list_id,
    sentAt: r.sent_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
    items: ((r.items ?? []) as Row[]).map(mapItem).sort((a, b) => a.position - b.position),
  };
}

/** Escapa curingas do LIKE/ilike para que a busca trate % e _ como texto. */
const likeSafe = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`);

export class SupabaseRepository implements DataRepository {
  readonly mode = 'supabase' as const;

  constructor(
    private readonly sb: SupabaseClient,
    private readonly family: Family,
  ) {}

  private get familyId() {
    return this.family.id;
  }

  async searchProducts(query: string, opts: SearchOptions = {}): Promise<AnyProduct[]> {
    const limit = opts.limit ?? 30;
    const catalogReq = this.sb.rpc('search_products', {
      p_query: query,
      p_department: opts.department ?? null,
      p_limit: limit,
      p_offset: 0,
    });
    const tokens = normalizeText(query).split(' ').filter(Boolean);
    let ownReq = this.sb.from('family_products').select('*').eq('family_id', this.familyId).limit(10);
    for (const t of tokens) ownReq = ownReq.like('search_text', `%${likeSafe(t)}%`);
    const [catalog, own] = await Promise.all([catalogReq, opts.department || tokens.length === 0 ? null : ownReq]);
    fail(catalog.error);
    if (own) fail(own.error);
    return [...((own?.data ?? []) as Row[]).map(mapFamilyProduct), ...((catalog.data ?? []) as Row[]).map(mapProduct)];
  }

  private departments: string[] | null = null;

  async listDepartments(): Promise<string[]> {
    if (this.departments) return this.departments;
    const { data, error } = await this.sb.rpc('list_departments');
    fail(error);
    this.departments = ((data ?? []) as Row[]).map((r) => r.department as string);
    return this.departments;
  }

  async createFamilyProduct(input: NewFamilyProduct): Promise<FamilyProduct> {
    const { data, error } = await this.sb
      .from('family_products')
      .insert({
        family_id: this.familyId,
        name: input.name.trim(),
        brand: input.brand?.trim() || null,
        variant: input.variant?.trim() || null,
        size_label: input.sizeLabel?.trim() || null,
        category: input.category?.trim() || null,
        note: input.note?.trim() || null,
      })
      .select('*')
      .single();
    fail(error);
    return mapFamilyProduct(data as Row);
  }

  private async userId(): Promise<string> {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) throw new Error('Sessão expirada. Entre novamente.');
    return data.user.id;
  }

  async getDisplayName(): Promise<string> {
    const { data, error } = await this.sb.from('profiles').select('display_name').eq('id', await this.userId()).maybeSingle();
    fail(error);
    return (data as Row | null)?.display_name ?? '';
  }

  async setDisplayName(name: string): Promise<void> {
    const { error } = await this.sb
      .from('profiles')
      .update({ display_name: name.trim().slice(0, 80) })
      .eq('id', await this.userId());
    fail(error);
  }

  /** Listas concluídas que o usuário removeu do próprio histórico (continuam no banco). */
  private async hiddenListIds(): Promise<Set<string>> {
    const { data, error } = await this.sb.from('list_hides').select('list_id');
    fail(error);
    return new Set(((data ?? []) as Row[]).map((r) => r.list_id as string));
  }

  async getFamily(): Promise<Family> {
    return this.family;
  }

  async listMembers(): Promise<FamilyMember[]> {
    const { data, error } = await this.sb
      .from('family_members')
      .select('user_id, role, status, profile:profiles(display_name)')
      .eq('family_id', this.familyId)
      .eq('status', 'active');
    fail(error);
    return ((data ?? []) as Row[]).map((r) => ({
      userId: r.user_id,
      displayName: r.profile?.display_name || 'Membro',
      role: r.role,
      status: 'active',
    }));
  }

  async listLists(status: 'active' | 'completed'): Promise<ShoppingList[]> {
    const hidden = status === 'completed' ? await this.hiddenListIds() : new Set<string>();
    const { data, error } = await this.sb
      .from('shopping_lists')
      .select(LIST_COLUMNS)
      .eq('family_id', this.familyId)
      .eq('status', status)
      .order(status === 'completed' ? 'completed_at' : 'updated_at', { ascending: false })
      .limit(100);
    fail(error);
    return ((data ?? []) as Row[]).map(mapList).filter((l) => !hidden.has(l.id));
  }

  async getList(id: string): Promise<ShoppingList | null> {
    const { data, error } = await this.sb.from('shopping_lists').select(LIST_COLUMNS).eq('id', id).maybeSingle();
    fail(error);
    return data ? mapList(data as Row) : null;
  }

  private async mustGetList(id: string): Promise<ShoppingList> {
    const list = await this.getList(id);
    if (!list) throw new Error('Lista não encontrada.');
    return list;
  }

  async createList(name: string, kind: ListKind = 'complete'): Promise<ShoppingList> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Dê um nome para a lista.');
    const { data, error } = await this.sb
      .from('shopping_lists')
      .insert({ family_id: this.familyId, name: trimmed.slice(0, 80), kind })
      .select('id')
      .single();
    fail(error);
    return this.mustGetList((data as Row).id);
  }

  async renameList(listId: string, name: string): Promise<ShoppingList> {
    const { error } = await this.sb.from('shopping_lists').update({ name: name.trim().slice(0, 80) }).eq('id', listId);
    fail(error);
    return this.mustGetList(listId);
  }

  async sendList(listId: string): Promise<ShoppingList> {
    const { error } = await this.sb.rpc('send_shopping_list', { p_list: listId });
    fail(error);
    return this.mustGetList(listId);
  }

  async deleteList(listId: string): Promise<'deleted' | 'hidden'> {
    const list = await this.mustGetList(listId);
    if (list.status === 'completed') {
      const { error } = await this.sb.rpc('hide_shopping_list', { p_list: listId });
      fail(error);
      return 'hidden';
    }
    const { error } = await this.sb.from('shopping_lists').delete().eq('id', listId);
    fail(error);
    return 'deleted';
  }

  async addProduct(listId: string, product: AnyProduct, quantity: number): Promise<ShoppingList> {
    const list = await this.mustGetList(listId);
    const existing = list.items.find((i) =>
      product.kind === 'catalog' ? i.productId === product.id : i.familyProductId === product.id,
    );
    if (existing) return this.setQuantity(listId, existing.id, existing.quantityRequested + quantity);
    const { error } = await this.sb.from('shopping_list_items').insert({
      list_id: listId,
      product_id: product.kind === 'catalog' ? product.id : null,
      family_product_id: product.kind === 'family' ? product.id : null,
      name_snapshot: product.name,
      brand_snapshot: product.brand,
      variant_snapshot: product.variant,
      size_label_snapshot: product.sizeLabel,
      category_snapshot: product.category,
      // URL pública da foto no momento da inclusão (cópia de identificação)
      image_ref_snapshot: product.imageUrl,
      quantity_requested: quantity,
      position: list.items.length,
    });
    fail(error);
    return this.mustGetList(listId);
  }

  async addTextItem(listId: string, text: string, quantity: number): Promise<ShoppingList> {
    const name = text.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!name) throw new Error('Escreva o que precisa comprar.');
    const list = await this.mustGetList(listId);
    const key = normalizeText(name);
    const existing = list.items.find((i) => !i.productId && !i.familyProductId && normalizeText(i.snapshot.name) === key);
    if (existing) return this.setQuantity(listId, existing.id, existing.quantityRequested + quantity);
    const { error } = await this.sb.from('shopping_list_items').insert({
      list_id: listId,
      name_snapshot: name,
      quantity_requested: Math.max(1, Math.min(quantity, 999)),
      position: list.items.length,
    });
    fail(error);
    return this.mustGetList(listId);
  }

  async setQuantity(listId: string, itemId: string, quantity: number): Promise<ShoppingList> {
    const { error } = await this.sb
      .from('shopping_list_items')
      .update({ quantity_requested: Math.max(1, Math.min(quantity, 999)) })
      .eq('id', itemId);
    fail(error);
    return this.mustGetList(listId);
  }

  async removeItem(listId: string, itemId: string): Promise<ShoppingList> {
    const { error } = await this.sb.from('shopping_list_items').delete().eq('id', itemId);
    fail(error);
    return this.mustGetList(listId);
  }

  async toggleItem(listId: string, itemId: string): Promise<ShoppingList> {
    const list = await this.mustGetList(listId);
    const item = list.items.find((i) => i.id === itemId);
    if (!item) throw new Error('Item não encontrado.');
    const next =
      item.status === 'purchased'
        ? { status: 'pending', quantity_purchased: null }
        : { status: 'purchased', quantity_purchased: item.quantityRequested };
    const { error } = await this.sb.from('shopping_list_items').update(next).eq('id', itemId);
    fail(error);
    return this.mustGetList(listId);
  }

  async completeList(listId: string): Promise<Purchase> {
    const { data, error } = await this.sb.rpc('complete_shopping_list', { p_list: listId });
    fail(error);
    const purchases = await this.listPurchases();
    const found = purchases.find((p) => p.id === data);
    if (!found) throw new Error('Compra registrada, mas não foi possível carregá-la.');
    return found;
  }

  async cloneList(listId: string, name: string): Promise<ShoppingList> {
    const { data, error } = await this.sb.rpc('clone_shopping_list', { p_list: listId, p_name: name });
    fail(error);
    return this.mustGetList(data as string);
  }

  async listPurchases(): Promise<Purchase[]> {
    const hidden = await this.hiddenListIds();
    const { data, error } = await this.sb
      .from('purchases')
      .select(
        'id, family_id, list_id, confirmed_at, list:shopping_lists(name), items:purchase_items(id, list_item_id, product_id, family_product_id, name_snapshot, brand_snapshot, variant_snapshot, size_label_snapshot, image_ref_snapshot, quantity_purchased)',
      )
      .eq('family_id', this.familyId)
      .order('confirmed_at', { ascending: false })
      .limit(100);
    fail(error);
    return ((data ?? []) as Row[]).filter((r) => !hidden.has(r.list_id)).map((r) => ({
      id: r.id,
      familyId: r.family_id,
      listId: r.list_id,
      listName: r.list?.name ?? 'Lista',
      confirmedAt: r.confirmed_at,
      items: ((r.items ?? []) as Row[]).map((i) => ({
        id: i.id,
        listItemId: i.list_item_id,
        productId: i.product_id,
        familyProductId: i.family_product_id,
        snapshot: {
          name: i.name_snapshot,
          brand: i.brand_snapshot,
          variant: i.variant_snapshot,
          sizeLabel: i.size_label_snapshot,
          category: null,
          imageUrl: publicImageUrl(i.image_ref_snapshot),
        },
        quantityPurchased: Number(i.quantity_purchased),
      })),
    }));
  }

  // ---------------------------------------------------------------- convites (só o responsável)

  async listInvites(): Promise<PendingInvite[]> {
    const { data, error } = await this.sb
      .from('family_invites')
      .select('id, name, email, code, expires_at, email_sent_at, created_at')
      .eq('family_id', this.familyId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: true });
    fail(error);
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      code: r.code,
      expiresAt: r.expires_at,
      emailSentAt: r.email_sent_at,
      expired: new Date(r.expires_at).getTime() < Date.now(),
    }));
  }

  async inviteSlots(): Promise<number> {
    const { data, error } = await this.sb.rpc('family_invite_slots', { p_family: this.familyId });
    fail(error);
    return Number(data ?? 0);
  }

  /**
   * Convida por nome + e-mail. A Edge Function "invite-member" cria o convite (regras no banco)
   * e envia o e-mail. Se a função ainda não foi publicada, o convite é criado mesmo assim e o
   * app mostra o código para compartilhar manualmente.
   */
  async inviteMember(name: string, email: string): Promise<InviteResult> {
    return this.callInviteFunction({ action: 'create', familyId: this.familyId, name: name.trim(), email: normalizeEmail(email) }, async () => {
      const { data, error } = await this.sb.rpc('create_family_invite', {
        p_family: this.familyId,
        p_name: name.trim(),
        p_email: normalizeEmail(email),
      });
      fail(error);
      return data as string;
    });
  }

  async resendInvite(inviteId: string): Promise<InviteResult> {
    return this.callInviteFunction({ action: 'resend', inviteId }, async () => {
      const { data, error } = await this.sb.rpc('renew_family_invite', { p_invite: inviteId });
      fail(error);
      return data as string;
    });
  }

  private async callInviteFunction(body: Record<string, string>, fallback: () => Promise<string>): Promise<InviteResult> {
    const { data, error } = await this.sb.functions.invoke('invite-member', { body });
    if (!error) return data as InviteResult;
    if (error instanceof FunctionsHttpError) {
      // a função respondeu com erro de regra (limite, duplicado...): mostramos a mensagem dela
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? 'Não foi possível enviar o convite.');
    }
    // função não publicada ou sem rede: cria o convite direto no banco, sem e-mail
    const code = await fallback();
    return { code, emailSent: false, reason: 'email_service_unavailable' };
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const { error } = await this.sb.from('family_invites').update({ revoked_at: new Date().toISOString() }).eq('id', inviteId);
    fail(error);
  }

  async removeMember(userId: string): Promise<void> {
    const { error } = await this.sb
      .from('family_members')
      .update({ status: 'removed', removed_at: new Date().toISOString() })
      .eq('family_id', this.familyId)
      .eq('user_id', userId);
    fail(error);
  }

  /** Situação do acesso da família (só leitura; quem grava é o webhook da loja). */
  async getAccess(): Promise<FamilyAccess> {
    const { data, error } = await this.sb.from('entitlements').select('status, provider').eq('family_id', this.familyId);
    fail(error);
    return familyAccess((data ?? []) as EntitlementRow[]);
  }

  /**
   * Exclui a conta de quem está logado (Edge Function delete-account). Depois disso a sessão
   * local precisa ser encerrada por quem chamou.
   */
  async deleteAccount(): Promise<void> {
    const { error } = await this.sb.functions.invoke('delete-account', { body: { confirm: DELETE_CONFIRMATION } });
    if (!error) return;
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? 'Não foi possível excluir a conta.');
    }
    throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }

  /** Atualização em tempo real: recarrega quando outro membro altera a lista. */
  subscribeToList(listId: string, onChange: () => void): () => void {
    const channel = this.sb
      .channel(`list-${listId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_list_items', filter: `list_id=eq.${listId}` }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shopping_lists', filter: `id=eq.${listId}` }, onChange)
      .subscribe();
    return () => {
      this.sb.removeChannel(channel);
    };
  }
}

/** Família ativa do usuário logado (a primeira em que é membro ativo). */
export async function loadMyFamily(sb: SupabaseClient): Promise<Family | null> {
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data, error } = await sb
    .from('family_members')
    .select('role, family:families(id, name)')
    .eq('user_id', uid)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  fail(error);
  if (!data) return null;
  const r = data as Row;
  return { id: r.family.id, name: r.family.name, role: r.role };
}
