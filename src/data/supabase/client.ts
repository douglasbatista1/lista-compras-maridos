import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { env } from '@/config/env';

let client: SupabaseClient | null = null;

/** Cliente único. Só existe quando EXPO_PUBLIC_SUPABASE_URL e a chave pública estão definidas. */
export function getSupabase(): SupabaseClient | null {
  if (!env.supabaseEnabled) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseKey, {
      auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export function publicImageUrl(path: string | null | undefined): string | null {
  const sb = getSupabase();
  if (!sb || !path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return sb.storage.from(env.productImagesBucket).getPublicUrl(path).data.publicUrl;
}
