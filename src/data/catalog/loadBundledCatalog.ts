import type { LocalCatalog } from './localCatalog';

/**
 * Carrega o catálogo de demonstração (~2,6 MB) por import dinâmico: no site ele vira um
 * arquivo à parte, baixado só no modo demonstração, nunca por quem usa o app com conta.
 * (Nos testes Jest este módulo é substituído por um require direto.)
 */
export async function loadBundledCatalog(): Promise<LocalCatalog> {
  const { getBundledCatalog } = await import('./localCatalog');
  return getBundledCatalog();
}
