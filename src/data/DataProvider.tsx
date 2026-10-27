import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { env } from '@/config/env';
import type { Clock } from '@/domain/lists';
import type { Family } from '@/domain/types';

import { loadBundledCatalog } from './catalog/loadBundledCatalog';
import { LocalRepository } from './local/localRepository';
import type { DataRepository } from './repository';
import { getSupabase } from './supabase/client';
import { SupabaseRepository, loadMyFamily } from './supabase/supabaseRepository';

export const appClock: Clock = { newId: () => randomUUID(), now: () => new Date().toISOString() };

type DataState =
  | { status: 'loading' }
  | { status: 'ready'; repo: DataRepository; family: Family }
  | { status: 'needs-auth' }
  | { status: 'needs-family' }
  | { status: 'error'; message: string };

type DataContextValue = {
  state: DataState;
  mode: 'local' | 'supabase';
  /** Incrementa a cada alteração para que telas abertas recarreguem. */
  revision: number;
  invalidate: () => void;
  reloadSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const mode = env.supabaseEnabled ? 'supabase' : 'local';

  const reloadSession = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) {
      const repo = new LocalRepository(AsyncStorage, await loadBundledCatalog(), appClock);
      const family = await repo.getFamily();
      setState({ status: 'ready', repo, family });
      return;
    }
    try {
      const { data } = await sb.auth.getSession();
      if (!data.session) return setState({ status: 'needs-auth' });
      const family = await loadMyFamily(sb);
      if (!family) return setState({ status: 'needs-family' });
      setState({ status: 'ready', repo: new SupabaseRepository(sb, family), family });
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Falha ao conectar.' });
    }
  }, []);

  useEffect(() => {
    // Sincroniza com sistemas externos (AsyncStorage / Supabase Auth); o setState só ocorre após await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reloadSession();
    const sb = getSupabase();
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') reloadSession();
    });
    return () => data.subscription.unsubscribe();
  }, [reloadSession]);

  const value = useMemo<DataContextValue>(
    () => ({
      state,
      mode,
      revision,
      invalidate: () => setRevision((r) => r + 1),
      reloadSession,
      signOut: async () => {
        await getSupabase()?.auth.signOut();
        await reloadSession();
      },
    }),
    [state, mode, revision, reloadSession],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData fora do DataProvider');
  return ctx;
}

export function useRepo(): DataRepository {
  const { state } = useData();
  if (state.status !== 'ready') throw new Error('Dados ainda não disponíveis');
  return state.repo;
}

/**
 * Carrega dados do repositório, recarrega ao voltar para a tela e após alterações.
 * Erros de rede viram mensagem visível em vez de falha silenciosa.
 */
export function useQuery<T>(load: (repo: DataRepository) => Promise<T>, key = '') {
  const repo = useRepo();
  const { revision } = useData();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadRef.current(repo));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar.');
    } finally {
      setLoading(false);
    }
    // `key` e `revision` disparam o recarregamento; `load` é lido pela ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, revision, key]);

  useFocusEffect(
    useCallback(() => {
      run();
    }, [run]),
  );

  return { data, setData, error, loading, reload: run };
}
