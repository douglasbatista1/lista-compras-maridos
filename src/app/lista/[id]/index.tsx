import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CheckCheck, Pencil, Plus, Send } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { ShoppingListItemRow } from '@/components/product';
import { SimpleItemInput, SimpleListItemRow } from '@/components/simpleList';
import { AppText, Card, EmptyState, Field, Notice, PrimaryButton, ProgressIndicator, Screen, SecondaryButton } from '@/components/ui';
import { appClock, useData, useQuery, useRepo } from '@/data/DataProvider';
import { SupabaseRepository } from '@/data/supabase/supabaseRepository';
import { formatDateTime } from '@/domain/format';
import * as Domain from '@/domain/lists';
import type { ShoppingList } from '@/domain/types';
import { colors, fonts, space } from '@/theme/tokens';

export default function ChecklistScreen() {
  const { id, editar } = useLocalSearchParams<{ id: string; editar?: string }>();
  const repo = useRepo();
  const { invalidate } = useData();
  const { data: list, setData, error: loadError, loading, reload } = useQuery((r) => r.getList(id), id);
  const [editing, setEditing] = useState(editar === '1');
  const [confirming, setConfirming] = useState<null | 'complete' | 'delete'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  // aberto pelo menu "Editar lista": preenche o nome quando a lista carregar
  const [nameLoaded, setNameLoaded] = useState(false);
  if (list && !nameLoaded) {
    setNameLoaded(true);
    setName(list.name);
  }

  // Outro membro da família marcou algo? Recarrega (somente com Supabase).
  useEffect(() => {
    if (repo instanceof SupabaseRepository && id) return repo.subscribeToList(id, () => reload());
  }, [repo, id, reload]);

  const items = useMemo(() => (list ? Domain.checklistOrder(list.items) : []), [list]);
  const progress = list ? Domain.progressOf(list) : { done: 0, total: 0, ratio: 0 };

  /** Atualização otimista: a tela responde na hora e o servidor confirma depois. */
  async function mutate(local: (l: ShoppingList) => ShoppingList, remote: () => Promise<ShoppingList>) {
    if (!list) return;
    const previous = list;
    try {
      setData(local(list));
      setData(await remote());
      setError(null);
      invalidate();
    } catch (e) {
      setData(previous);
      setError(e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.');
      reload();
    }
  }

  async function complete() {
    setBusy(true);
    try {
      const purchase = await repo.completeList(id);
      invalidate();
      router.replace({ pathname: '/historico/[id]', params: { id: purchase.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
      setBusy(false);
      setConfirming(null);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await repo.deleteList(id);
      invalidate();
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível apagar.');
      setBusy(false);
      setConfirming(null);
    }
  }

  function send() {
    return mutate((l) => Domain.sendList(l, appClock), () => repo.sendList(id));
  }

  async function finishEditing() {
    if (list && name.trim() && name.trim() !== list.name) {
      await mutate((l) => Domain.renameList(l, name, appClock), () => repo.renameList(id, name));
    }
    setEditing(false);
  }

  if (!list) {
    return (
      <Screen edges={['bottom']}>
        <View style={{ padding: space.lg }}>
          {loading ? <ActivityIndicator color={colors.forest} /> : <Notice tone="error">{loadError ?? 'Lista não encontrada.'}</Notice>}
        </View>
      </Screen>
    );
  }

  const active = list.status === 'active';
  const simple = list.kind === 'simple';

  function addText(text: string, quantity: number) {
    return mutate((l) => Domain.addTextItem(l, text, quantity, appClock), () => repo.addTextItem(id, text, quantity));
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen
        options={{
          title: list.name,
          headerRight: () =>
            active && list.items.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (editing) return finishEditing();
                  setName(list.name);
                  setEditing(true);
                }}
                hitSlop={10}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, minHeight: 44 }}>
                {editing ? null : <Pencil size={16} color={colors.forest} />}
                <Text style={{ fontFamily: fonts.semibold, color: colors.forest, fontSize: 16 }}>{editing ? 'Pronto' : 'Editar'}</Text>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 140 }}
        ListHeaderComponent={
          <View style={{ marginBottom: space.md, gap: space.md }}>
            {editing ? (
              <Field label="Nome da lista" value={name} onChangeText={setName} maxLength={80} onSubmitEditing={finishEditing} />
            ) : null}
            {simple && active && !editing ? <SimpleItemInput onAdd={addText} /> : null}
            {list.items.length > 0 ? <ProgressIndicator done={progress.done} total={progress.total} /> : null}
            {active && !editing && list.items.length > 0 && !list.sentAt ? (
              <Card style={{ padding: space.md }}>
                <AppText variant="label" style={{ color: colors.ink }}>
                  Lista em preparação
                </AppText>
                <AppText variant="meta" style={{ marginBottom: space.sm }}>
                  Terminou de montar? Envie para quem vai ao mercado.
                </AppText>
                <SecondaryButton label="Enviar lista" icon={<Send size={18} color={colors.forest} />} onPress={send} />
              </Card>
            ) : null}
            {active && list.sentAt ? <AppText variant="meta">Enviada em {formatDateTime(list.sentAt)}</AppText> : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
            {!active ? <Notice>Esta lista foi concluída e está no histórico.</Notice> : null}
            {active && !editing && list.items.length > 0 ? (
              <AppText variant="meta">Toque no item para marcar como comprado.</AppText>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const Row = simple ? SimpleListItemRow : ShoppingListItemRow;
          return (
            <Row
              item={item}
              editing={editing}
              onToggle={() =>
                active && mutate((l) => Domain.toggleItem(l, item.id, appClock), () => repo.toggleItem(id, item.id))
              }
              onQuantity={(q) => mutate((l) => Domain.setQuantity(l, item.id, q, appClock), () => repo.setQuantity(id, item.id, q))}
              onRemove={() => mutate((l) => Domain.removeItem(l, item.id, appClock), () => repo.removeItem(id, item.id))}
            />
          );
        }}
        ListEmptyComponent={
          simple ? (
            <EmptyState title="Lista vazia" message="Escreva acima o que precisa comprar e toque em Adicionar." />
          ) : (
            <EmptyState
              title="Lista vazia"
              message="Adicione os produtos exatos que precisam ser comprados."
              action={
                <PrimaryButton
                  label="Adicionar produtos"
                  icon={<Plus size={20} color={colors.white} />}
                  onPress={() => router.push({ pathname: '/lista/[id]/adicionar', params: { id } })}
                />
              }
            />
          )
        }
        ListFooterComponent={
          editing ? (
            <View style={{ marginTop: space.xl }}>
              {confirming === 'delete' ? (
                <Card>
                  <AppText variant="bodyStrong">Apagar “{list.name}”?</AppText>
                  <AppText variant="meta" style={{ marginVertical: space.sm }}>
                    A lista e os itens serão apagados. Esta ação não pode ser desfeita.
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <SecondaryButton label="Cancelar" onPress={() => setConfirming(null)} style={{ flex: 1 }} />
                    <SecondaryButton label="Apagar" onPress={remove} loading={busy} style={{ flex: 1, borderColor: colors.error }} />
                  </View>
                </Card>
              ) : (
                <SecondaryButton label="Apagar lista" onPress={() => setConfirming('delete')} />
              )}
            </View>
          ) : undefined
        }
      />
      {active && list.items.length > 0 && !editing ? (
        <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, gap: space.sm }}>
          {confirming === 'complete' ? (
            <Card>
              <AppText variant="bodyStrong">Concluir a compra?</AppText>
              <AppText variant="meta" style={{ marginVertical: space.sm }}>
                {progress.done} de {progress.total} itens marcados vão para o histórico como comprados.
                {progress.done < progress.total ? ' Os não marcados ficam registrados como não comprados.' : ''}
              </AppText>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <SecondaryButton label="Voltar" onPress={() => setConfirming(null)} style={{ flex: 1 }} />
                <PrimaryButton label="Confirmar" onPress={complete} loading={busy} style={{ flex: 1 }} />
              </View>
            </Card>
          ) : (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {simple ? null : (
                <SecondaryButton
                  label="Adicionar"
                  icon={<Plus size={18} color={colors.forest} />}
                  onPress={() => router.push({ pathname: '/lista/[id]/adicionar', params: { id } })}
                  style={{ flex: 1 }}
                />
              )}
              <PrimaryButton
                label="Concluir compra"
                icon={<CheckCheck size={20} color={colors.white} />}
                onPress={() => setConfirming('complete')}
                disabled={progress.done === 0}
                accessibilityHint={progress.done === 0 ? 'Marque pelo menos um item comprado' : undefined}
                style={{ flex: 1.6 }}
              />
            </View>
          )}
        </View>
      ) : null}
    </Screen>
  );
}
