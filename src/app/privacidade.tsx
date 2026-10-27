import { Stack } from 'expo-router';
import { View } from 'react-native';

import { AppText, Notice, Screen } from '@/components/ui';
import { CONTROLLER, PRIVACY_SECTIONS, PRIVACY_UPDATED_AT } from '@/content/privacy';
import { colors, space } from '@/theme/tokens';

/** https://lista-compras-maridos.vercel.app/privacidade — pública, com ou sem login (exigida pelas lojas). */
export default function PrivacyScreen() {
  const draft = CONTROLLER.name.startsWith('[') || CONTROLLER.email.startsWith('[');
  return (
    <Screen edges={['bottom']} scroll>
      <Stack.Screen options={{ title: 'Política de Privacidade' }} />
      <AppText variant="screenTitle" accessibilityRole="header">
        Política de Privacidade
      </AppText>
      <AppText variant="meta" style={{ marginTop: 2, marginBottom: space.lg }}>
        Lista de Compras para Maridos · atualizada em {PRIVACY_UPDATED_AT}
      </AppText>
      {draft ? <Notice>Versão preliminar: os dados do responsável e o contato serão preenchidos antes da publicação nas lojas.</Notice> : null}
      {PRIVACY_SECTIONS.map((section) => (
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
    </Screen>
  );
}
