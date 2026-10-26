import { Tabs } from 'expo-router';
import { Clock, ListChecks, Search, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/theme/tokens';

/**
 * Altura da barra calculada a partir da área segura do aparelho (barra de gestos do
 * Android/iPhone), para que ícones e rótulos nunca fiquem cortados.
 */
const BAR_CONTENT_HEIGHT = 58;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.warmgray,
          height: BAR_CONTENT_HEIGHT + bottom,
          paddingTop: 6,
          paddingBottom: bottom,
        },
        tabBarItemStyle: { height: BAR_CONTENT_HEIGHT - 6, justifyContent: 'center' },
        tabBarIconStyle: { marginBottom: 2 },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
        sceneStyle: { backgroundColor: colors.ivory },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Listas', tabBarIcon: ({ color }) => <ListChecks color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="catalogo"
        options={{ title: 'Produtos', tabBarIcon: ({ color }) => <Search color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="historico"
        options={{ title: 'Histórico', tabBarIcon: ({ color }) => <Clock color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="familia"
        options={{ title: 'Família', tabBarIcon: ({ color }) => <Users color={color} size={24} /> }}
      />
    </Tabs>
  );
}
