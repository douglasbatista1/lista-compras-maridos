import { Mail, RefreshCw, Trash, UserMinus, UserPlus, Users, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { InviteResult, PendingInvite, SupabaseRepository } from '@/data/supabase/supabaseRepository';
import { MAX_INVITED_PEOPLE, isValidEmail } from '@/domain/auth';
import { formatDate } from '@/domain/format';
import type { FamilyMember } from '@/domain/types';
import { colors, fonts, radii, space } from '@/theme/tokens';

import { ActionSheet, type SheetAction } from './ActionSheet';
import { AppText, Card, Field, Notice, PrimaryButton, SectionTitle } from './ui';

/**
 * Pessoas da família (modo Supabase): membros, convites por e-mail (até 5 pessoas além
 * do responsável), reenviar, cancelar e remover. As regras valem no banco; aqui só a interface.
 */
export function FamilyPeople({ repo, isOwner, members, onChanged }: {
  repo: SupabaseRepository;
  isOwner: boolean;
  members: FamilyMember[];
  onChanged: () => void;
}) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [slots, setSlots] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; res: InviteResult } | null>(null);
  const [sheet, setSheet] = useState<{ title: string; actions: SheetAction[] } | null>(null);

  const load = useCallback(async () => {
    if (!isOwner) return;
    try {
      const [list, free] = await Promise.all([repo.listInvites(), repo.inviteSlots()]);
      setInvites(list);
      setSlots(free);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os convites.');
    }
  }, [repo, isOwner]);

  useEffect(() => {
    // busca no servidor; o setState só acontece depois do await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await repo.inviteMember(name, email);
      setResult({ email: email.trim().toLowerCase(), res });
      setName('');
      setEmail('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o convite.');
    } finally {
      setSending(false);
    }
  }

  function inviteMenu(inv: PendingInvite) {
    setSheet({
      title: inv.name ? `${inv.name} · ${inv.email ?? ''}` : (inv.email ?? inv.code),
      actions: [
        {
          label: 'Reenviar convite',
          icon: <RefreshCw size={20} color={colors.forest} />,
          onPress: async () => {
            const res = await repo.resendInvite(inv.id);
            setResult({ email: inv.email ?? '', res });
            await load();
          },
        },
        {
          label: 'Cancelar convite',
          icon: <X size={20} color={colors.error} />,
          destructive: true,
          confirm: {
            title: 'Cancelar este convite?',
            message: 'O link enviado deixa de funcionar e a vaga fica livre para outra pessoa.',
            confirmLabel: 'Cancelar convite',
          },
          onPress: async () => {
            await repo.revokeInvite(inv.id);
            await load();
          },
        },
      ],
    });
  }

  function memberMenu(m: FamilyMember) {
    setSheet({
      title: m.displayName,
      actions: [
        {
          label: 'Remover da família',
          icon: <UserMinus size={20} color={colors.error} />,
          destructive: true,
          confirm: {
            title: `Remover ${m.displayName}?`,
            message: 'A pessoa deixa de ver e alterar as listas da família. Você pode convidá-la de novo depois.',
            confirmLabel: 'Remover',
          },
          onPress: async () => {
            await repo.removeMember(m.userId);
            onChanged();
            await load();
          },
        },
      ],
    });
  }

  const canSend = isValidEmail(email) && name.trim().length > 0 && (slots ?? 0) > 0;

  return (
    <>
      <Card>
        <View style={styles.header}>
          <Users size={20} color={colors.forest} />
          <AppText variant="bodyStrong">Quem usa esta lista</AppText>
        </View>
        {members.map((m) => {
          const removable = isOwner && m.role !== 'owner';
          return (
            <Pressable
              key={m.userId}
              disabled={!removable}
              accessibilityRole={removable ? 'button' : undefined}
              accessibilityHint={removable ? 'Abre a opção de remover da família' : undefined}
              onPress={() => memberMenu(m)}
              style={styles.row}>
              <Text style={styles.rowTitle}>{m.displayName}</Text>
              <Text style={styles.rowMeta}>{m.role === 'owner' ? 'responsável' : 'membro'}</Text>
            </Pressable>
          );
        })}
      </Card>

      <SectionTitle>Convidar pessoas</SectionTitle>
      {isOwner ? (
        <Card>
          <View style={styles.header}>
            <UserPlus size={20} color={colors.forest} />
            <AppText variant="bodyStrong">Enviar convite por e-mail</AppText>
          </View>
          <AppText variant="meta" style={{ marginBottom: space.md }}>
            {slots === null
              ? 'Carregando vagas…'
              : slots > 0
                ? `Você pode convidar mais ${slots} de ${MAX_INVITED_PEOPLE} pessoas (cônjuge, filhos, quem ajuda em casa).`
                : `Limite de ${MAX_INVITED_PEOPLE} pessoas atingido. Cancele um convite ou remova alguém para liberar vaga.`}
          </AppText>
          <Field label="Nome" value={name} onChangeText={setName} placeholder="Ex.: João" maxLength={80} />
          <Field
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="pessoa@exemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          {error ? <Notice tone="error">{error}</Notice> : null}
          {result ? (
            result.res.emailSent ? (
              <Notice tone="demo">Convite enviado para {result.email}. O link vale por 7 dias.</Notice>
            ) : (
              <View style={styles.codeBox}>
                <AppText variant="meta">
                  {result.res.reason === 'already_registered'
                    ? `${result.email} já tem conta. Peça para a pessoa entrar no app e digitar este código:`
                    : 'O envio de e-mail ainda não está configurado. Envie este código para a pessoa digitar no app:'}
                </AppText>
                <AppText variant="screenTitle" selectable style={{ letterSpacing: 4 }}>
                  {result.res.code}
                </AppText>
              </View>
            )
          ) : null}
          <PrimaryButton label="Enviar convite" icon={<Mail size={18} color={colors.white} />} onPress={send} loading={sending} disabled={!canSend} />
        </Card>
      ) : (
        <Card>
          <AppText variant="meta">Apenas o responsável pela família pode convidar pessoas.</AppText>
        </Card>
      )}

      {isOwner && invites.length > 0 ? (
        <>
          <SectionTitle>Convites pendentes</SectionTitle>
          <Card style={{ paddingVertical: space.sm }}>
            {invites.map((inv) => (
              <Pressable
                key={inv.id}
                accessibilityRole="button"
                accessibilityLabel={`Convite para ${inv.name ?? inv.email}`}
                accessibilityHint="Abre as opções reenviar e cancelar"
                onPress={() => inviteMenu(inv)}
                style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{inv.name ?? inv.email}</Text>
                  <Text style={styles.rowMeta}>
                    {inv.email} ·{' '}
                    {inv.expired
                      ? 'expirado — toque para reenviar'
                      : inv.emailSentAt
                        ? `enviado em ${formatDate(inv.emailSentAt)}`
                        : `código ${inv.code}`}
                  </Text>
                </View>
                {inv.expired ? <Trash size={18} color={colors.muted} /> : <RefreshCw size={18} color={colors.muted} />}
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      <ActionSheet visible={sheet !== null} title={sheet?.title ?? ''} actions={sheet?.actions ?? []} onClose={() => setSheet(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.warmgray,
  },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  rowMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  codeBox: { backgroundColor: colors.softgreen, borderRadius: radii.image, padding: space.lg, marginBottom: space.md },
});
