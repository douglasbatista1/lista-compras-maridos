import { View } from 'react-native';

import { DemoNotice } from '@/components/DemoNotice';
import { ProductSearch } from '@/components/ProductSearch';
import { Screen, ScreenTitle } from '@/components/ui';
import { space } from '@/theme/tokens';

export default function CatalogScreen() {
  return (
    <Screen>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
        <ScreenTitle title="Produtos" subtitle="Busque pelo nome, marca ou tamanho" />
        <DemoNotice />
      </View>
      <ProductSearch />
    </Screen>
  );
}
