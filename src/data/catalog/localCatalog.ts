import { searchProducts, toSearchable, type Searchable } from '@/domain/search';
import type { AnyProduct, CatalogProduct, SizeUnit } from '@/domain/types';

/**
 * Catálogo compacto gerado por `npm run catalog:build` a partir dos arquivos reais
 * em "Banco de produtos/". Usado só no modo demonstração (sem Supabase).
 */
export type CompactCatalog = {
  version: number;
  source: string;
  imageBase: string;
  departments: string[];
  /** [id, name, brand, sizeLabel, sizeValue, sizeUnit, packQty, deptIndex, category, gtin, img] */
  products: [
    string,
    string,
    string | null,
    string | null,
    number | null,
    string | null,
    number | null,
    number,
    string | null,
    string | null,
    string | null,
  ][];
};

/** Miniatura gerada pelo CDN de origem (VTEX: /ids/<id>-<largura>-<altura>/arquivo). */
export function thumbnailUrl(imageBase: string, img: string | null, size = 240): string | null {
  if (!img) return null;
  const slash = img.indexOf('/');
  if (slash < 0) return null;
  return `${imageBase}${img.slice(0, slash)}-${size}-${size}${img.slice(slash)}`;
}

export function parseCatalog(file: CompactCatalog): CatalogProduct[] {
  return file.products.map((r) => ({
    kind: 'catalog',
    id: r[0],
    name: r[1],
    brand: r[2],
    variant: null,
    sizeLabel: r[3],
    sizeValue: r[4],
    sizeUnit: r[5] as SizeUnit | null,
    packQty: r[6],
    department: r[7] >= 0 ? file.departments[r[7]] ?? null : null,
    category: r[8],
    gtin: r[9],
    imageUrl: thumbnailUrl(file.imageBase, r[10]),
  }));
}

export class LocalCatalog {
  private index: Searchable[] | null = null;
  private products: CatalogProduct[] | null = null;

  constructor(private readonly load: () => CompactCatalog) {}

  private ensure() {
    if (!this.products) {
      const file = this.load();
      this.products = parseCatalog(file);
      this.departmentsCache = file.departments;
      this.index = this.products.map((p) => toSearchable(p));
    }
    return this.index!;
  }

  private departmentsCache: string[] = [];

  departments(): string[] {
    this.ensure();
    return this.departmentsCache;
  }

  size(): number {
    this.ensure();
    return this.products!.length;
  }

  search(query: string, opts: { department?: string | null; limit?: number } = {}): AnyProduct[] {
    return searchProducts(this.ensure(), query, opts);
  }
}

let shared: LocalCatalog | null = null;

/** Instância única; o JSON (~2,6 MB) só é lido na primeira busca. */
export function getBundledCatalog(): LocalCatalog {
  if (!shared) {
    shared = new LocalCatalog(() => require('../../../assets/catalog/catalog.json') as CompactCatalog);
  }
  return shared;
}
