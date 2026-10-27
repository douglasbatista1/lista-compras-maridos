import { LegalDocument } from '@/components/LegalDocument';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED_AT } from '@/content/privacy';

/** https://lista-compras-maridos.vercel.app/privacidade — pública, com ou sem login (exigida pelas lojas). */
export default function PrivacyScreen() {
  return (
    <LegalDocument
      title="Política de Privacidade"
      updatedAt={PRIVACY_UPDATED_AT}
      sections={PRIVACY_SECTIONS}
      related={{ href: '/termos', label: 'Termos de Uso' }}
    />
  );
}
