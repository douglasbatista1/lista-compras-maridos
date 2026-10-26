import { Image } from 'expo-image';
import { Bell, LogOut, UserPlus, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { FamilyPeople } from '@/components/FamilyPeople';
import { AppText, Card, Field, Screen, ScreenTitle, SecondaryButton, SectionTitle } from '@/components/ui';
import { useData, useQuery, useRepo } from '@/data/DataProvider';
import { SupabaseRepository } from '@/data/supabase/supabaseRepository';
import { MAX_INVITED_PEOPLE } from '@/domain/auth';
import { formatDate } from '@/domain/format';
import { MIN_PURCHASES, estimateReplenishment } from '@/domain/replenishment';
import { colors, space, tagline } from '@/theme/tokens';

function Badge({ children }: { children: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: colors.sage, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <AppText variant="metaStrong" style={{ fontSize: 12 }}>
        {children}
      </AppText>
    </View>
  );
}

export default function FamilyScreen() {
  const repo = useRepo();
  const { mode, signOut, state, invalidate } = useData();
  const { data } = useQuery(async (r) => ({
    members: await r.listMembers(),
    purchases: await r.listPurchases(),
    displayName: await r.getDisplayName(),
  }));
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const nameValue = nameDraft ?? data?.displayName ?? '';
  const family = state.status === 'ready' ? state.family : null;
  const estimates = estimateReplenishment(data?.purchases ?? []);

  async function saveName() {
    setSavingName(true);
    try {
      await repo.setDisplayName(nameValue);
      setNameDraft(null);
      invalidate();
    } finally {
      setSavingName(false);
    }
  }

  return (
    <Screen scroll>
      <ScreenTitle title="Família" subtitle={family?.name} />

      <Card style={{ marginBottom: space.md }}>
        <Field label="Seu nome" value={nameValue} onChangeText={setNameDraft} placeholder="Como a família te chama" maxLength={80} />
        <SecondaryButton
          label="Salvar nome"
          onPress={saveName}
          loading={savingName}
          disabled={nameDraft === null || nameValue.trim() === (data?.displayName ?? '')}
        />
      </Card>

      {repo instanceof SupabaseRepository ? (
        <FamilyPeople repo={repo} isOwner={family?.role === 'owner'} members={data?.members ?? []} onChanged={invalidate} />
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
              <Users size={20} color={colors.forest} />
              <AppText variant="bodyStrong">Quem usa esta lista</AppText>
            </View>
            {(data?.members ?? []).map((m) => (
              <AppText key={m.userId} style={{ marginTop: 4 }}>
                {m.displayName} {m.role === 'owner' ? '· responsável' : ''}
              </AppText>
            ))}
          </Card>

          <SectionTitle>Convidar pessoas</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
              <UserPlus size={20} color={colors.forest} />
              <AppText variant="bodyStrong">Até {MAX_INVITED_PEOPLE} pessoas por e-mail</AppText>
            </View>
            <Badge>Demonstrativo</Badge>
            <AppText variant="meta" style={{ marginTop: space.sm }}>
              Com a conta conectada (Supabase), você informa nome e e-mail e a pessoa recebe um link para criar a senha e
              entrar na família. Nesta demonstração nenhum e-mail é enviado.
            </AppText>
          </Card>
        </>
      )}

      <SectionTitle>Reposição (experimental)</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
          <Bell size={20} color={colors.forest} />
          <AppText variant="bodyStrong">Quando comprar de novo</AppText>
        </View>
        {estimates.length === 0 ? (
          <AppText variant="meta">
            Ainda não há dados suficientes. A estimativa aparece para um produto depois de pelo menos {MIN_PURCHASES} compras
            confirmadas do mesmo item e tamanho, em dias diferentes. É uma estimativa do seu hábito de compra, não do consumo.
          </AppText>
        ) : (
          estimates.slice(0, 8).map((e) => (
            <View key={e.key} style={{ marginTop: space.sm }}>
              <AppText variant="bodyStrong">
                {e.name} {e.sizeLabel ? `· ${e.sizeLabel}` : ''}
              </AppText>
              <AppText variant="meta">
                Comprado a cada ~{e.averageDays} dias ({e.purchases} compras). Estimativa: por volta de {formatDate(e.nextEstimate)}.
              </AppText>
            </View>
          ))
        )}
      </Card>

      {mode === 'supabase' ? (
        <>
          <SectionTitle>Conta</SectionTitle>
          <SecondaryButton label="Sair" icon={<LogOut size={18} color={colors.forest} />} onPress={signOut} />
        </>
      ) : null}

      <SectionTitle>Sobre</SectionTitle>
      <Card>
        <Image
          source={require('../../../assets/brand/logo_horizontal.png')}
          style={{ width: '100%', height: 80 }}
          contentFit="contain"
          accessibilityLabel={`Lista de Compras para Maridos. ${tagline}`}
        />
        <AppText variant="meta" style={{ marginTop: space.md }}>
          {mode === 'local'
            ? 'Catálogo: produtos reais coletados do site Giassi (sem preços). Fotos exibidas a partir do site de origem apenas nesta demonstração; licença de uso comercial ainda não verificada.'
            : 'Catálogo comum a todas as famílias; listas, histórico e produtos cadastrados ficam visíveis só para a sua família.'}
        </AppText>
        <AppText variant="meta" style={{ marginTop: space.sm }}>
          O app não usa sua localização.
        </AppText>
      </Card>
    </Screen>
  );
}
