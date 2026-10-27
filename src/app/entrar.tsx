import { AuthScreen } from '@/components/AuthScreen';

/** https://lista-compras-maridos.vercel.app/entrar — login (com a aba "Criar conta"). */
export default function SignInRoute() {
  return <AuthScreen initialMode="entrar" />;
}
