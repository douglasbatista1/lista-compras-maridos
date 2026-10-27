import { LegalDocument } from '@/components/LegalDocument';
import { TERMS_SECTIONS, TERMS_UPDATED_AT } from '@/content/terms';

/** https://lista-compras-maridos.vercel.app/termos — pública, com ou sem login (pedida pelas lojas). */
export default function TermsScreen() {
  return (
    <LegalDocument
      title="Termos de Uso"
      updatedAt={TERMS_UPDATED_AT}
      sections={TERMS_SECTIONS}
      related={{ href: '/privacidade', label: 'Política de Privacidade' }}
    />
  );
}
