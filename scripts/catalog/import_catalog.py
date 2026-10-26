#!/usr/bin/env python3
"""
Importação do catálogo real (coleta Giassi em "Banco de produtos/") para o modelo `products`.

Somente biblioteca padrão do Python 3.10+. Subcomandos:

  validate   Valida e normaliza localmente; grava relatório em scripts/catalog/out/.
  build-app  Gera assets/catalog/catalog.json (catálogo compacto do modo demonstração).
  sql        Gera um arquivo SQL idempotente (INSERT ... ON CONFLICT) para psql.
  compress-images  Converte as fotos para WebP (padrão 500 px, qualidade 80) em
             scripts/catalog/out/images_webp/ — ~205 MB em vez de ~498 MB. Requer Pillow.
  push       Envia ao Supabase via REST em lotes (upsert), com checkpoint para retomar.
             Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em variáveis de ambiente
             ou em .env.import.local (ignorado pelo Git). NUNCA use essa chave no app.
             --upload-images também envia as fotos ao bucket do Storage.

Idempotência: cada produto tem id = uuid5(NAMESPACE, "giassi:<sku_id>") e chave única
(source, source_id). Rodar duas vezes atualiza as mesmas linhas, sem duplicar.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_DIR = ROOT / "Banco de produtos"
OUT_DIR = ROOT / "scripts" / "catalog" / "out"
APP_CATALOG = ROOT / "assets" / "catalog" / "catalog.json"
NAMESPACE = uuid.UUID("6f1d8c1e-3b8a-4e55-9a51-8f2d6a0c4b17")  # fixo: não alterar
SOURCE = "giassi"
STORAGE_BUCKET = "product-images"
WEBP_DIR = OUT_DIR / "images_webp"
IMAGE_CDN_PREFIX = "https://giassi.vteximg.com.br/arquivos/ids/"

UNIT_MAP = {
    "g": "g", "kg": "kg", "mg": "mg", "ml": "ml", "l": "l", "un": "un",
    "cm": "cm", "m": "m", "mm": "mm", "folhas": "folhas", "cápsulas": "capsulas", "capsulas": "capsulas",
}
UNIT_LABEL = {"l": "L", "capsulas": "cápsulas"}
SMALL_WORDS = {"de", "da", "do", "das", "dos", "e", "a", "o", "em", "para", "com"}


# ---------------------------------------------------------------------------
# Normalização (mesma regra de src/domain/search.ts e public.normalize_text)
# ---------------------------------------------------------------------------
def normalize_text(s: str | None) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = re.sub(r"(\d),(\d)", r"\1.\2", s)
    s = re.sub(r"[^a-z0-9.\s]", " ", s)
    s = re.sub(r"(\d)\s+(kg|g|mg|ml|l|un|cm|mm|m)\b", r"\1\2", s)
    return re.sub(r"\s+", " ", s).strip()


def clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").replace(" ", " ")).strip()


def gtin_is_valid(code: str) -> bool:
    """Valida dígito verificador GS1 (GTIN-8/12/13/14)."""
    if not code.isdigit() or len(code) not in (8, 12, 13, 14) or set(code) == {"0"}:
        return False
    digits = [int(c) for c in code]
    body, check = digits[:-1], digits[-1]
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def title_brand(brand: str) -> str:
    """'FORNO DE MINAS' -> 'Forno de Minas'. Siglas curtas (OMO, 3M) ficam como estão."""
    if not brand.isupper() or len(brand) <= 3:
        return brand
    words = brand.split(" ")
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        if i > 0 and lw in SMALL_WORDS:
            out.append(lw)
        elif len(w) <= 2 and w.isalpha():
            out.append(w)  # provável sigla
        else:
            out.append(lw[:1].upper() + lw[1:])
    return " ".join(out)


def fmt_number(v: float) -> str:
    if v == int(v):
        return str(int(v))
    return f"{v:.3f}".rstrip("0").rstrip(".").replace(".", ",")


def size_label(value: float | None, unit: str | None, pack: int | None, raw: str) -> str | None:
    if value is not None and unit:
        base = f"{fmt_number(value)} {UNIT_LABEL.get(unit, unit)}"
        return f"{pack} × {base}" if pack and pack > 1 else base
    raw = clean(raw)
    return raw or None


def to_float(s: str) -> float | None:
    s = clean(s).replace(",", ".")
    try:
        v = float(s)
        return v if v > 0 else None
    except ValueError:
        return None


def to_int(s: str) -> int | None:
    v = to_float(s)
    return int(v) if v and v == int(v) else None


# ---------------------------------------------------------------------------
# Leitura + validação
# ---------------------------------------------------------------------------
def read_rows(source_dir: Path) -> list[dict]:
    csv_path = source_dir / "produtos.csv"
    if not csv_path.exists():
        sys.exit(f"Arquivo não encontrado: {csv_path}")
    csv.field_size_limit(10**9)
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def canonical_brands(rows: list[dict]) -> dict[str, str]:
    """Agrupa variações de caixa da mesma marca e escolhe a grafia mais comum (preferindo não-maiúscula)."""
    groups: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        b = clean(r.get("marca"))
        if b:
            groups[b.lower()][b] += 1
    canon = {}
    for key, counter in groups.items():
        ranked = sorted(counter.items(), key=lambda kv: (kv[0].isupper(), -kv[1]))
        canon[key] = title_brand(ranked[0][0])
    return canon


def transform(rows: list[dict], source_dir: Path) -> tuple[list[dict], list[dict], dict]:
    brands = canonical_brands(rows)
    products, errors = [], []
    seen_ids: set[str] = set()
    seen_gtin: dict[str, str] = {}
    stats = Counter()
    for line_no, r in enumerate(rows, start=2):  # linha 1 = cabeçalho
        sku = clean(r.get("sku_id"))
        name = clean(r.get("nome"))
        problems = []
        if not sku:
            problems.append("sku_id vazio")
        if not name:
            problems.append("nome vazio")
        if sku in seen_ids:
            problems.append("sku_id repetido")
        if problems:
            errors.append({"linha": line_no, "sku_id": sku, "erros": problems})
            continue
        seen_ids.add(sku)

        raw_ean = clean(r.get("ean"))
        gtin = raw_ean if gtin_is_valid(raw_ean) else None
        if raw_ean and not gtin:
            stats["ean_invalido"] += 1
            errors.append({"linha": line_no, "sku_id": sku, "aviso": f"EAN '{raw_ean}' não é um GTIN válido (provável código interno da loja); gtin ficou nulo"})
        if gtin and gtin in seen_gtin:
            stats["ean_repetido"] += 1
            errors.append({"linha": line_no, "sku_id": sku, "aviso": f"EAN repetido com sku {seen_gtin[gtin]}; gtin ficou nulo"})
            gtin = None
        if gtin:
            seen_gtin[gtin] = sku

        brand_raw = clean(r.get("marca"))
        brand = brands.get(brand_raw.lower()) if brand_raw else None
        if brand and brand != brand_raw:
            stats["marca_normalizada"] += 1

        unit_raw = clean(r.get("embalagem_unidade"))
        unit = UNIT_MAP.get(unit_raw.lower()) if unit_raw else None
        if unit_raw and not unit:
            stats["unidade_desconhecida"] += 1
        value = to_float(r.get("embalagem_valor", ""))
        pack = to_int(r.get("embalagem_qtd_pack", ""))
        label = size_label(value, unit, pack, r.get("embalagem", ""))
        if not label:
            stats["sem_tamanho"] += 1

        desc = clean(r.get("descricao"))
        if r.get("descricao_igual_nome") == "True" or desc == name:
            desc = None

        img_file = clean(r.get("imagem_arquivo"))
        img_status = clean(r.get("imagem_status")) or "sem_imagem"
        img_local = source_dir / img_file if img_file else None
        has_local = bool(img_local and img_local.exists())
        if img_status == "baixada" and not has_local:
            stats["imagem_ausente_no_disco"] += 1
        # no Storage as fotos vão compactadas em WebP (ver compress-images)
        image_path = f"{SOURCE}/{sku}.webp" if has_local else None

        dept = clean(r.get("departamento")) or None
        products.append({
            "id": str(uuid.uuid5(NAMESPACE, f"{SOURCE}:{sku}")),
            "source": SOURCE,
            "source_id": sku,
            "source_product_id": clean(r.get("produto_id")) or None,
            "source_ref_code": clean(r.get("codigo_referencia")) or None,
            "source_url": clean(r.get("url_produto")) or None,
            "source_ean_raw": raw_ean or None,
            "gtin": gtin,
            "name": name,
            "brand": brand,
            "brand_raw": brand_raw or None,
            "variant": None,  # a origem não tem campo de variante; o nome completo a contém
            "description": desc,
            "department": dept,
            "category": clean(r.get("categoria")) or None,
            "subcategory": clean(r.get("subcategoria")) or None,
            "category_path": clean(r.get("categoria_caminho")) or None,
            "size_value": value,
            "size_unit": unit,
            "pack_qty": pack,
            "size_label": label,
            "size_raw": clean(r.get("embalagem")) or None,
            "sale_unit": clean(r.get("unidade_venda")) or None,
            "image_path": image_path,
            "image_source_url": clean(r.get("imagem_url")) or None,
            "image_status": img_status,
            "image_license": "desconhecida",
            "needs_review": r.get("possivel_duplicata") == "True",
            "is_active": True,
            "_image_local": str(img_local) if has_local else None,
        })
        stats["importados"] += 1
        if image_path:
            stats["com_imagem_local"] += 1
        if gtin:
            stats["com_gtin_valido"] += 1
        if r.get("possivel_duplicata") == "True":
            stats["possivel_duplicata"] += 1

    # Duplicatas prováveis: mesmo nome + marca + tamanho normalizados (não são mescladas)
    key_count = Counter((normalize_text(p["name"]), normalize_text(p["brand"]), p["size_label"]) for p in products)
    stats["grupos_nome_marca_tamanho_repetidos"] = sum(1 for c in key_count.values() if c > 1)
    stats["linhas_lidas"] = len(rows)
    stats["erros_bloqueantes"] = sum(1 for e in errors if "erros" in e)
    return products, errors, dict(stats)


def write_report(products, errors, stats):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    depts = Counter(p["department"] for p in products)
    report = {"estatisticas": stats, "departamentos": dict(depts.most_common()), "total_produtos": len(products)}
    (OUT_DIR / "import_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(OUT_DIR / "import_errors.jsonl", "w", encoding="utf-8") as f:
        for e in errors:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"Relatório: {OUT_DIR / 'import_report.json'}  |  Ocorrências por linha: {OUT_DIR / 'import_errors.jsonl'} ({len(errors)})")


# ---------------------------------------------------------------------------
# Catálogo compacto para o modo demonstração
# ---------------------------------------------------------------------------
def build_app(products):
    depts = sorted({p["department"] for p in products if p["department"]})
    dept_idx = {d: i for i, d in enumerate(depts)}
    rows = []
    for p in sorted(products, key=lambda x: (x["department"] or "", x["name"])):
        img = None
        src = p["image_source_url"]
        if src and src.startswith(IMAGE_CDN_PREFIX) and p["image_status"] == "baixada":
            img = src[len(IMAGE_CDN_PREFIX):]  # "<id>/<arquivo>"; o app monta a miniatura
        rows.append([
            p["id"], p["name"], p["brand"], p["size_label"], p["size_value"], p["size_unit"], p["pack_qty"],
            dept_idx.get(p["department"], -1), p["category"], p["gtin"], img,
        ])
    payload = {
        "version": 1,
        "source": SOURCE,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "imageBase": IMAGE_CDN_PREFIX,
        "imageNotice": "Imagens servidas pelo CDN de origem apenas no modo demonstração; licença de uso desconhecida.",
        "fields": ["id", "name", "brand", "sizeLabel", "sizeValue", "sizeUnit", "packQty", "dept", "category", "gtin", "img"],
        "departments": depts,
        "products": rows,
    }
    APP_CATALOG.parent.mkdir(parents=True, exist_ok=True)
    APP_CATALOG.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Catálogo do app: {APP_CATALOG} ({APP_CATALOG.stat().st_size / 1e6:.1f} MB, {len(rows)} produtos)")


# ---------------------------------------------------------------------------
# SQL idempotente / REST
# ---------------------------------------------------------------------------
DB_COLUMNS = [
    "id", "source", "source_id", "source_product_id", "source_ref_code", "source_url", "source_ean_raw", "gtin",
    "name", "brand", "brand_raw", "variant", "description", "department", "category", "subcategory", "category_path",
    "size_value", "size_unit", "pack_qty", "size_label", "size_raw", "sale_unit", "image_path", "image_source_url",
    "image_status", "image_license", "needs_review", "is_active",
]


def sql_literal(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def write_sql(products, out: Path, batch: int):
    updates = ", ".join(f"{c} = excluded.{c}" for c in DB_COLUMNS if c not in ("id", "source", "source_id"))
    with open(out, "w", encoding="utf-8") as f:
        f.write("-- Gerado por scripts/catalog/import_catalog.py — idempotente (ON CONFLICT source, source_id)\n")
        f.write("begin;\n")
        for i in range(0, len(products), batch):
            chunk = products[i:i + batch]
            values = ",\n".join("(" + ", ".join(sql_literal(p[c]) for c in DB_COLUMNS) + ")" for p in chunk)
            f.write(f"insert into public.products ({', '.join(DB_COLUMNS)}) values\n{values}\n"
                    f"on conflict (source, source_id) do update set {updates}, updated_at = now();\n")
        f.write("commit;\n")
    print(f"SQL gerado: {out} ({len(products)} produtos)")


def load_env_file():
    env_file = ROOT / ".env.import.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")


def http(method: str, url: str, key: str, body: bytes | None = None, headers: dict | None = None, retries: int = 4):
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    h.update(headers or {})
    for attempt in range(retries):
        req = urllib.request.Request(url, data=body, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            return e.code, e.read()
        except urllib.error.URLError:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise


def compressed_path(p) -> Path:
    return WEBP_DIR / f"{p['source_id']}.webp"


def compress_images(products, size: int, quality: int):
    """Converte as fotos para WebP (fundo branco no lugar da transparência), sem refazer as já prontas."""
    try:
        from PIL import Image
    except ImportError:
        sys.exit("Instale o Pillow para compactar: python3 -m pip install pillow")
    WEBP_DIR.mkdir(parents=True, exist_ok=True)
    done = failed = 0
    orig_total = 0
    for n, p in enumerate(products, 1):
        if not p["_image_local"]:
            continue
        src, dst = Path(p["_image_local"]), compressed_path(p)
        orig_total += src.stat().st_size
        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            done += 1
            continue
        try:
            im = Image.open(src)
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg = Image.new("RGB", im.size, (255, 255, 255))
                bg.paste(im, mask=im.split()[-1])
                im = bg
            else:
                im = im.convert("RGB")
            im.thumbnail((size, size), Image.LANCZOS)
            tmp = dst.with_suffix(".tmp")
            im.save(tmp, "WEBP", quality=quality, method=6)
            tmp.replace(dst)
            done += 1
        except Exception as e:  # noqa: BLE001 — registra e segue
            failed += 1
            print(f"Falha ao compactar {src.name}: {e}", file=sys.stderr)
        if n % 1000 == 0:
            print(f"Compactadas: {done}")
    total = sum(f.stat().st_size for f in WEBP_DIR.glob("*.webp"))
    print(f"Fotos compactadas: {done} (falhas: {failed}). Original: {orig_total / 1e6:.0f} MB -> WebP: {total / 1e6:.0f} MB em {WEBP_DIR}")


def upload_one(url: str, key: str, p) -> tuple[str, int, bytes]:
    data = compressed_path(p).read_bytes()
    status, body = http("POST", f"{url}/storage/v1/object/{STORAGE_BUCKET}/{urllib.parse.quote(p['image_path'])}", key,
                        data, {"Content-Type": "image/webp", "x-upsert": "true", "Cache-Control": "max-age=31536000"})
    return p["image_path"], status, body


def push(products, batch: int, upload_images: bool, limit: int | None, workers: int = 8):
    load_env_file()
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (variáveis de ambiente ou .env.import.local). Nada foi enviado.")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint = OUT_DIR / "push_checkpoint.json"
    state = json.loads(checkpoint.read_text()) if checkpoint.exists() else {"rows_done": 0, "images_done": []}
    items = products[:limit] if limit else products
    failures = []
    endpoint = f"{url}/rest/v1/products?on_conflict=source,source_id"
    start = state["rows_done"] if state["rows_done"] <= len(items) else 0
    for i in range(start, len(items), batch):
        chunk = [{c: p[c] for c in DB_COLUMNS} for p in items[i:i + batch]]
        status, body = http("POST", endpoint, key, json.dumps(chunk).encode(), {
            "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"})
        if status not in (200, 201, 204):
            failures.append({"lote_inicio": i, "status": status, "resposta": body.decode(errors="replace")[:500]})
            print(f"Falha no lote {i}: HTTP {status}", file=sys.stderr)
            continue
        state["rows_done"] = i + len(chunk)
        checkpoint.write_text(json.dumps(state))
        print(f"Produtos enviados: {state['rows_done']}/{len(items)}")
    if upload_images:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        done = set(state["images_done"])
        pending = [p for p in items if p["image_path"] and p["image_path"] not in done]
        missing = [p for p in pending if not compressed_path(p).exists()]
        if missing:
            sys.exit(f"{len(missing)} fotos ainda não foram compactadas. Rode antes: import_catalog.py compress-images")
        print(f"Enviando {len(pending)} fotos ({workers} em paralelo)...")
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(upload_one, url, key, p) for p in pending]
            for n, fut in enumerate(as_completed(futures), 1):
                path, status, body = fut.result()
                if status in (200, 201):
                    done.add(path)
                else:
                    failures.append({"imagem": path, "status": status, "resposta": body.decode(errors="replace")[:300]})
                if n % 500 == 0:
                    state["images_done"] = sorted(done)
                    checkpoint.write_text(json.dumps(state))
                    print(f"Fotos enviadas: {len(done)}")
        state["images_done"] = sorted(done)
        checkpoint.write_text(json.dumps(state))
    (OUT_DIR / "push_failures.json").write_text(json.dumps(failures, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Concluído. Falhas: {len(failures)} (ver {OUT_DIR / 'push_failures.json'})")
    if not failures and state["rows_done"] >= len(items):
        checkpoint.unlink(missing_ok=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["validate", "build-app", "sql", "compress-images", "push"])
    ap.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    ap.add_argument("--out", type=Path, default=OUT_DIR / "products_upsert.sql")
    ap.add_argument("--batch", type=int, default=500)
    ap.add_argument("--limit", type=int, default=None, help="push: envia só os N primeiros (teste)")
    ap.add_argument("--upload-images", action="store_true")
    ap.add_argument("--image-size", type=int, default=500, help="compress-images: lado máximo em px")
    ap.add_argument("--image-quality", type=int, default=80, help="compress-images: qualidade WebP (0-100)")
    ap.add_argument("--workers", type=int, default=8, help="push: envios de fotos em paralelo")
    args = ap.parse_args()

    rows = read_rows(args.source_dir)
    products, errors, stats = transform(rows, args.source_dir)
    if args.command == "validate":
        write_report(products, errors, stats)
    elif args.command == "build-app":
        build_app(products)
    elif args.command == "sql":
        args.out.parent.mkdir(parents=True, exist_ok=True)
        write_sql(products, args.out, args.batch)
    elif args.command == "compress-images":
        compress_images(products, args.image_size, args.image_quality)
    elif args.command == "push":
        push(products, args.batch, args.upload_images, args.limit, args.workers)


if __name__ == "__main__":
    main()
