import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AppText, Field, Notice, PrimaryButton, Screen } from '@/components/ui';
import { useData, useRepo } from '@/data/DataProvider';
import { space } from '@/theme/tokens';

/** Produto particular da família: não entra no catálogo global. */
export default function ManualProductScreen() {
  const params = useLocalSearchParams<{ listId?: string; name?: string }>();
  const repo = useRepo();
  const { invalidate } = useData();
  const [form, setForm] = useState({
    name: params.name ?? '',
    brand: '',
    variant: '',
    sizeLabel: '',
    category: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const product = await repo.createFamilyProduct(form);
      if (params.listId) await repo.addProduct(params.listId, product, 1);
      invalidate();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  }

  return (
    <Screen edges={['bottom']} scroll>
      <Notice>
        Este produto fica disponível só para a sua família. Descreva marca e tamanho para evitar dúvidas no mercado.
      </Notice>
      <Field label="Nome do produto *" value={form.name} onChangeText={set('name')} placeholder="Ex.: Pão de fermentação natural" maxLength={120} autoFocus={!form.name} />
      <Field label="Marca" value={form.brand} onChangeText={set('brand')} placeholder="Ex.: Padaria do bairro" maxLength={80} />
      <Field label="Variante / sabor" value={form.variant} onChangeText={set('variant')} placeholder="Ex.: Integral" maxLength={80} />
      <Field label="Tamanho ou peso" value={form.sizeLabel} onChangeText={set('sizeLabel')} placeholder="Ex.: 500 g, 1 L, 12 unidades" maxLength={40} />
      <Field label="Categoria" value={form.category} onChangeText={set('category')} placeholder="Ex.: Padaria" maxLength={60} />
      <Field label="Observação" value={form.note} onChangeText={set('note')} placeholder="Ex.: pegar o mais fresco" maxLength={200} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <PrimaryButton
        label={params.listId ? 'Salvar e adicionar à lista' : 'Salvar produto'}
        onPress={save}
        disabled={!form.name.trim()}
        loading={saving}
        style={{ marginTop: space.sm }}
      />
      <AppText variant="meta" style={{ marginTop: space.md, textAlign: 'center' }}>
        * obrigatório
      </AppText>
    </Screen>
  );
}
