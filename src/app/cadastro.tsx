import { AuthScreen } from '@/components/AuthScreen';

/** https://lista-compras-maridos.vercel.app/cadastro — abre direto na aba "Criar conta". */
export default function SignUpRoute() {
  return <AuthScreen initialMode="criar" />;
}
