import { env } from '@/config/env';
import { useData } from '@/data/DataProvider';

import { Notice } from './ui';

/** Sempre visível no modo demonstração: nada aqui é sincronizado entre aparelhos. */
export function DemoNotice() {
  const { mode } = useData();
  if (mode !== 'local') return null;
  return (
    <Notice tone="demo">
      {env.unsafeKeyRejected
        ? 'Uma chave secreta foi configurada no app e foi recusada por segurança. Usando o modo demonstração.'
        : 'Modo demonstração: suas listas ficam só neste aparelho. Conta, convite e sincronização exigem o Supabase configurado.'}
    </Notice>
  );
}
