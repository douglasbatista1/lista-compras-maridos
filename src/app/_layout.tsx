import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppText, Notice, PrimaryButton, Screen } from '@/components/ui';
import { DataProvider, useData } from '@/data/DataProvider';
import { colors, fonts, space } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => {
    if (loaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, fontError]);

  if (!loaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <DataProvider>
        <StatusBar style="dark" />
        <Gate />
      </DataProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const { state, reloadSession } = useData();

  if (state.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ivory }}>
        <ActivityIndicator color={colors.forest} />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <View style={{ padding: space.lg, gap: space.lg }}>
          <AppText variant="screenTitle">Sem conexão</AppText>
          <Notice tone="error">{state.message}</Notice>
          <PrimaryButton label="Tentar novamente" onPress={reloadSession} />
        </View>
      </Screen>
    );
  }

  const ready = state.status === 'ready';
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.ivory },
        headerTintColor: colors.forest,
        headerTitleStyle: { fontFamily: fonts.semibold, color: colors.ink },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.ivory },
      }}>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="lista/nova" options={{ title: 'Nova lista', presentation: 'modal' }} />
        <Stack.Screen name="lista/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="lista/[id]/adicionar" options={{ title: 'Adicionar produtos' }} />
        <Stack.Screen name="produto-manual" options={{ title: 'Cadastrar produto', presentation: 'modal' }} />
        <Stack.Screen name="historico/[id]" options={{ title: 'Compra' }} />
      </Stack.Protected>
      <Stack.Protected guard={state.status === 'needs-auth'}>
        <Stack.Screen name="entrar" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={state.status === 'needs-family'}>
        <Stack.Screen name="familia-inicial" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* links de e-mail: abrem em qualquer estado (com ou sem login) */}
      <Stack.Screen name="convite" options={{ headerShown: false }} />
      <Stack.Screen name="redefinir-senha" options={{ headerShown: false }} />
    </Stack>
  );
}
