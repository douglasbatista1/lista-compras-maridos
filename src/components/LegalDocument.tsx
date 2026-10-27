import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

import type { LegalSection } from '@/content/privacy';
import { colors, space } from '@/theme/tokens';

import { AppText, Screen } from './ui';

/** Página pública de texto legal (Privacidade, Termos): abre com ou sem login. */
export function LegalDocument({
  title,
  updatedAt,
  sections,
  related,
}: {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
  related: { href: '/privacidade' | '/termos'; label: string };
}) {
  return (
    <Screen edges={['bottom']} scroll>
      <Stack.Screen options={{ title }} />
      <AppText variant="screenTitle" accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="meta" style={{ marginTop: 2, marginBottom: space.lg }}>
        Lista de Compras para Maridos · atualizada em {updatedAt}
      </AppText>
      {sections.map((section) => (
        <View key={section.title} style={{ marginTop: space.lg }}>
          <AppText variant="sectionTitle" accessibilityRole="header" style={{ marginBottom: space.sm }}>
            {section.title}
          </AppText>
          {section.paragraphs.map((p) => (
            <AppText key={p} style={{ marginBottom: space.sm, fontSize: 15, lineHeight: 22, color: colors.ink }}>
              {p}
            </AppText>
          ))}
        </View>
      ))}
      <Link href={related.href} style={{ marginTop: space.lg, paddingVertical: space.sm }}>
        <AppText variant="metaStrong" style={{ textDecorationLine: 'underline' }}>
          {related.label}
        </AppText>
      </Link>
    </Screen>
  );
}
