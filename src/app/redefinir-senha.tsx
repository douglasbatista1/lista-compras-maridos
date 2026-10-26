import { SetPasswordScreen } from '@/components/SetPasswordScreen';

/** Link do e-mail "esqueci minha senha". */
export default function ResetPasswordScreen() {
  return <SetPasswordScreen kind="recovery" />;
}
