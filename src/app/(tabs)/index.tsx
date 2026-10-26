import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ListChecks, Pencil, Plus, Trash } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { DemoNotice } from '@/components/DemoNotice';
import { ListCard } from '@/components/product';
import { AppText, Card, EmptyState, Field, Notice, PrimaryButton, Screen, ScreenTitle, SecondaryButton } from '@/components/ui';
import { useData, useQuery, useRepo } from '@/data/DataProvider';
import { greeting } from '@/domain/format';
import type { ShoppingList } from '@/domain/types';
import { colors, space } from '@/theme/tokens';

/** Abre a lista enviada automaticamente só uma vez por abertura do app. */
let openedSentListThisSession = false;

export default function HomeScreen() {
  const repo = useRepo();
  const { invalidate } = useData();
  const { data, error, loading } = useQuery(async (r) => {
    const [lists, displayName] = await Promise.all([r.listLists('active'), r.getDisplayName()]);
    // listas enviadas (prontas para comprar) primeiro
    lists.sort((a, b) => Number(Boolean(b.sentAt)) - Number(Boolean(a.sentAt)));
    return { lists, displayName };
  });
  const lists = data?.lists;
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [menuFor, setMenuFor] = useState<ShoppingList | null>(null);

  // Quem abre o app com uma lista enviada e ainda não concluída já cai direto nela.
  useEffect(() => {
    if (openedSentListThisSession || !lists) return;
    openedSentListThisSession = true;
    const sent = lists.filter((l) => l.sentAt).sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0];
    if (sent) router.push({ pathname: '/lista/[id]', params: { id: sent.id } });
  }, [lists]);

  async function saveName() {
    setSavingName(true);
    try {
      await repo.setDisplayName(nameDraft);
      invalidate();
    } finally {
      setSavingName(false);
    }
  }

  return (
    <Screen>
      <FlatList
        data={lists ?? []}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }}
        ListHeaderComponent={
          <>
            <ScreenTitle
              title={greeting(data?.displayName ?? '')}
              subtitle="Vamos às compras?"
              right={
                <Image
                  source={require('../../../assets/brand/app_icon.png')}
                  style={{ width: 40, height: 40 }}
                  accessibilityLabel="Lista de Compras para Maridos"
                />
              }
            />
            {data && !data.displayName ? (
              <Card style={{ marginBottom: space.md }}>
                <AppText variant="bodyStrong" style={{ marginBottom: space.sm }}>
                  Como podemos te chamar?
                </AppText>
                <Field
                  label="Seu nome"
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder="Ex.: Ana"
                  maxLength={80}
                  returnKeyType="done"
                  onSubmitEditing={() => nameDraft.trim() && saveName()}
                />
                <SecondaryButton label="Salvar" onPress={saveName} loading={savingName} disabled={!nameDraft.trim()} />
              </Card>
            ) : null}
            <DemoNotice />
            {error ? <Notice tone="error">{error}</Notice> : null}
            {loading && !lists ? <ActivityIndicator color={colors.forest} style={{ marginTop: space.xl }} /> : null}
          </>
        }
        renderItem={({ item }) => (
          <ListCard list={item} onPress={() => router.push(`/lista/${item.id}`)} onLongPress={() => setMenuFor(item)} />
        )}
        ListFooterComponent={
          lists && lists.length > 0 ? (
            <AppText variant="meta" style={{ textAlign: 'center', marginTop: space.xs }}>
              Toque e segure uma lista para editar ou excluir.
            </AppText>
          ) : undefined
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon={<ListChecks size={28} color={colors.forest} />}
              title="Nenhuma lista ativa"
              message="Crie uma lista e escolha os produtos exatos — foto, marca e tamanho — para quem vai ao mercado."
            />
          ) : undefined
        }
      />
      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.name ?? ''}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                {
                  label: 'Editar lista',
                  icon: <Pencil size={20} color={colors.forest} />,
                  onPress: () => router.push({ pathname: '/lista/[id]', params: { id: menuFor.id, editar: '1' } }),
                },
                {
                  label: 'Excluir lista',
                  icon: <Trash size={20} color={colors.error} />,
                  destructive: true,
                  confirm: {
                    title: `Excluir “${menuFor.name}”?`,
                    message: 'A lista ainda não foi concluída, então ela e os itens serão apagados de vez.',
                    confirmLabel: 'Excluir',
                  },
                  onPress: async () => {
                    await repo.deleteList(menuFor.id);
                    invalidate();
                  },
                },
              ]
            : []
        }
      />
      <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg }}>
        <PrimaryButton label="Nova lista" icon={<Plus size={20} color={colors.white} />} onPress={() => router.push('/lista/nova')} />
      </View>
    </Screen>
  );
}
