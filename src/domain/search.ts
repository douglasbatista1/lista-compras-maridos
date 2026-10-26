import synonymsFile from './synonyms.json';
import type { AnyProduct } from './types';

const SYNONYMS: Record<string, string[]> = synonymsFile.terms;

/**
 * Normalização usada na busca local. A mesma regra existe no Postgres
 * (public.normalize_text, migração 0001) e no script de importação.
 * - minúsculas, sem acentos, espaços colapsados
 * - "1 kg" e "1kg" viram a mesma coisa; vírgula decimal vira ponto
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/(\d)\s+(kg|g|mg|ml|l|un|cm|mm|m)\b/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(query: string): string[] {
  return normalizeText(query).split(' ').filter(Boolean);
}

export type Searchable = {
  product: AnyProduct;
  /** nome + marca + variante + tamanho + categoria + aliases, normalizados */
  haystack: string;
  normName: string;
  normBrand: string;
};

export function toSearchable(product: AnyProduct, aliases: string[] = []): Searchable {
  const sizeLabel = product.sizeLabel ?? '';
  const parts = [
    product.name,
    product.brand,
    product.variant,
    sizeLabel,
    product.kind === 'catalog' ? product.department : null,
    product.category,
    ...aliases,
  ];
  return {
    product,
    haystack: normalizeText(parts.filter(Boolean).join(' ')),
    normName: normalizeText(product.name),
    normBrand: normalizeText(product.brand),
  };
}

/**
 * Pontua um produto para a consulta. Todos os termos precisam aparecer (AND);
 * correspondências no início do nome e marca exata sobem no ranking.
 * Retorna null quando não há correspondência.
 */
export function scoreSearchable(item: Searchable, tokens: string[], fullQuery: string): number | null {
  if (tokens.length === 0) return 0;
  let score = 0;
  for (const tok of tokens) {
    let idx = item.haystack.indexOf(tok);
    // sinônimo vale um pouco menos que o termo exato
    if (idx < 0) {
      const alt = SYNONYMS[tok]?.find((s) => item.haystack.includes(s));
      if (!alt) return null;
      idx = item.haystack.indexOf(alt);
      score -= 2;
    }
    // termo que começa uma palavra vale mais que termo no meio de outra
    const wordStart = idx === 0 || item.haystack[idx - 1] === ' ';
    score += wordStart ? 10 : 3;
    if (item.normName.startsWith(tok)) score += 6;
    if (item.normBrand === tok) score += 8;
  }
  if (item.normName === fullQuery) score += 100;
  else if (item.normName.startsWith(fullQuery)) score += 40;
  else if (item.normName.includes(fullQuery)) score += 15;
  // nomes mais curtos tendem a ser o produto "básico" procurado
  score -= Math.min(item.normName.length, 80) / 20;
  return score;
}

export function searchProducts(
  index: Searchable[],
  query: string,
  opts: { department?: string | null; limit?: number } = {},
): AnyProduct[] {
  const tokens = tokenize(query);
  const full = tokens.join(' ');
  const limit = opts.limit ?? 40;
  const scored: { p: AnyProduct; s: number }[] = [];
  for (const item of index) {
    if (opts.department && (item.product.kind !== 'catalog' || item.product.department !== opts.department)) continue;
    const s = scoreSearchable(item, tokens, full);
    if (s !== null) scored.push({ p: item.product, s });
  }
  scored.sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name, 'pt-BR'));
  return scored.slice(0, limit).map((x) => x.p);
}

/** Linha de identificação exibida nos cards: "Marca · Variante · 500 g". */
export function productSubtitle(p: { brand: string | null; variant: string | null; sizeLabel: string | null }): string {
  return [p.brand, p.variant, p.sizeLabel].filter(Boolean).join(' · ');
}
