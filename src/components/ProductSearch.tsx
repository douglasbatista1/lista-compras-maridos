import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useData, useRepo } from '@/data/DataProvider';
import type { AnyProduct, ShoppingList } from '@/domain/types';
import { colors, fonts, radii, space } from '@/theme/tokens';

import { Check, PackagePlus, Search } from './icons';
import { ProductCard } from './product';
import { AppText, CategoryChips, EmptyState, Notice, SearchInput, SecondaryButton, formatQty } from './ui';

const DEBOUNCE_MS = 250;

/** Debounce simples: espera a pessoa parar de digitar antes de consultar. */
export function useDebounced<T>(value: T, ms = DEBOUNCE_MS): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Busca incremental com sugestões enquanto a pessoa digita. Usada na aba Produtos
 * (com escolha da lista) e na tela "Adicionar produtos" de uma lista específica.
 */
export function ProductSearch({ listId: fixedListId, autoFocus }: { listId?: string; autoFocus?: boolean }) {
  const repo = useRepo();
  const { invalidate, revision } = useData();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<string | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [resolved, setResolved] = useState<{ key: string; results: AnyProduct[] }>({ key: '', results: [] });
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [targetId, setTargetId] = useState<string | null>(fixedListId ?? null);
  const [fixedTarget, setFixedTarget] = useState<ShoppingList | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  /**
   * Resultados mantidos na tela depois de "Adicionar": o campo de busca é limpo para o
   * próximo produto, mas a lista de opções continua até a pessoa digitar outra coisa.
   */
  const [kept, setKept] = useState<{ term: string; results: AnyProduct[] } | null>(null);
  const debounced = useDebounced(query);
  const requestSeq = useRef(0);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    repo.listDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, [repo]);

  // Lista alvo: fixa (rota da lista) ou escolhida entre as ativas (aba Produtos)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (fixedListId) {
        const l = await repo.getList(fixedListId);
        if (alive) setFixedTarget(l);
        return;
      }
      const active = await repo.listLists('active');
      if (!alive) return;
      setLists(active);
      setTargetId((cur) => (cur && active.some((l) => l.id === cur) ? cur : active[0]?.id ?? null));
    })().catch((e) => alive && setError(e instanceof Error ? e.message : 'Falha ao carregar listas.'));
    return () => {
      alive = false;
    };
  }, [repo, fixedListId, revision]);

  const target = fixedListId ? fixedTarget : (lists.find((l) => l.id === targetId) ?? null);
  const searchKey = `${debounced.trim()}|${department ?? ''}`;
  const hasCriteria = Boolean(debounced.trim() || department);

  useEffect(() => {
    if (!hasCriteria) return;
    const seq = ++requestSeq.current;
    repo
      .searchProducts(debounced.trim(), { department, limit: 40 })
      .then((r) => {
        if (seq === requestSeq.current) {
          setResolved({ key: searchKey, results: r });
          setError(null);
        }
      })
      .catch((e) => {
        if (seq !== requestSeq.current) return;
        setResolved({ key: searchKey, results: [] });
        setError(e instanceof Error ? e.message : 'Falha na busca.');
      });
  }, [searchKey, hasCriteria, debounced, department, repo]);

  const showingKept = Boolean(kept) && !query;
  // Ainda digitando ou aguardando a resposta da consulta atual
  const searching = !showingKept && hasCriteria && (query !== debounced || resolved.key !== searchKey);
  const results = useMemo(
    () => (showingKept ? kept!.results : hasCriteria && resolved.key === searchKey ? resolved.results : []),
    [showingKept, kept, hasCriteria, resolved, searchKey],
  );

  const addedQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of target?.items ?? []) {
      const key = i.productId ?? i.familyProductId;
      if (key) map.set(key, i.quantityRequested);
    }
    return map;
  }, [target]);

  const add = useCallback(
    async (product: AnyProduct, quantity: number) => {
      try {
        let list = target;
        if (!list) {
          list = await repo.createList('Minha lista');
          setTargetId(list.id);
        }
        const updated = await repo.addProduct(list.id, product, quantity);
        if (fixedListId) setFixedTarget(updated);
        setLists((ls) => (ls.some((l) => l.id === updated.id) ? ls.map((l) => (l.id === updated.id ? updated : l)) : [updated, ...ls]));
        setFeedback(`${formatQty(quantity)}× ${product.name} adicionado a "${updated.name}"`);
        // Campo limpo para o próximo produto; as opções e o filtro de categoria continuam.
        setKept((k) => (query ? { term: query.trim(), results } : k));
        setQuery('');
        inputRef.current?.focus();
        invalidate();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível adicionar.');
      }
    },
    [target, repo, invalidate, fixedListId, query, results],
  );

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 2200);
    return () => clearTimeout(t);
  }, [feedback]);

  const trimmed = debounced.trim();
  const showHint = !showingKept && !trimmed && !department;
  const noResults = !showHint && !searching && results.length === 0 && !error;
  const manualHref = {
    pathname: '/produto-manual' as const,
    params: { listId: target?.id ?? '', name: query.trim() },
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        {!fixedListId && lists.length > 0 ? (
          <View style={{ marginBottom: space.sm }}>
            <AppText variant="meta">Adicionando em</AppText>
            <FlatList
              horizontal
              data={lists}
              keyExtractor={(l) => l.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}
              renderItem={({ item }) => {
                const selected = item.id === targetId;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setTargetId(item.id)}
                    style={{
                      paddingHorizontal: space.md,
                      minHeight: 34,
                      justifyContent: 'center',
                      borderRadius: radii.chip,
                      backgroundColor: selected ? colors.sage : colors.white,
                      borderWidth: 1,
                      borderColor: selected ? colors.forest : colors.line,
                    }}>
                    <Text style={{ fontFamily: fonts.medium, color: colors.ink }}>{item.name}</Text>
                  </Pressable>
                );
              }}
            />
          </View>
        ) : null}
        <SearchInput
          ref={inputRef}
          value={query}
          onChangeText={(t) => {
            // digitar algo novo (ou limpar no X) substitui os resultados mantidos
            setKept(null);
            setQuery(t);
          }}
          autoFocus={autoFocus}
          loading={searching}
        />
        <CategoryChips
          options={departments}
          value={department}
          onChange={(d) => {
            setKept(null);
            setDepartment(d);
          }}
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
      </View>
      <FlatList
        data={results}
        keyExtractor={(p) => `${p.kind}:${p.id}`}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl * 2 }}
        renderItem={({ item }) => <ProductCard product={item} added={addedQty.get(item.id) ?? 0} onAdd={(q) => add(item, q)} />}
        ListHeaderComponent={
          showingKept && results.length > 0 ? (
            <AppText variant="meta" style={{ marginBottom: space.sm }}>
              Resultados de “{kept!.term}” · digite para buscar outro produto
            </AppText>
          ) : undefined
        }
        ListEmptyComponent={
          showHint ? (
            <EmptyState
              icon={<Search size={28} color={colors.forest} />}
              title="O que vamos comprar?"
              message="Digite o nome, a marca ou o tamanho (ex.: “café 500g”) ou escolha uma categoria."
            />
          ) : noResults ? (
            <EmptyState
              title={`Nada encontrado para “${trimmed}”`}
              message="Confira a grafia ou cadastre o produto só para a sua família."
              action={
                <SecondaryButton
                  label="Cadastrar produto"
                  icon={<PackagePlus size={18} color={colors.forest} />}
                  onPress={() => router.push(manualHref)}
                />
              }
            />
          ) : undefined
        }
        ListFooterComponent={
          results.length > 0 ? (
            <View style={{ marginTop: space.md }}>
              <AppText variant="meta" style={{ textAlign: 'center', marginBottom: space.sm }}>
                Não achou o produto exato?
              </AppText>
              <SecondaryButton
                label="Cadastrar produto da família"
                icon={<PackagePlus size={18} color={colors.forest} />}
                onPress={() => router.push(manualHref)}
              />
            </View>
          ) : undefined
        }
      />
      {feedback ? (
        // Balão flutuante: aparece e some sem empurrar os cards (evita toque no lugar errado)
        <View pointerEvents="none" accessibilityLiveRegion="polite" style={styles.toast}>
          <Check size={18} color={colors.white} />
          <Text style={styles.toastText} numberOfLines={2}>
            {feedback}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.forest,
    borderRadius: radii.card,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  toastText: { flex: 1, color: colors.white, fontFamily: fonts.medium, fontSize: 14 },
});
