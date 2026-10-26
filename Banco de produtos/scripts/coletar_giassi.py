#!/usr/bin/env python3
"""Coleta o catálogo de produtos do Giassi (loja VTEX) para o app Lista de Compras.

Fonte: API pública de catálogo da VTEX (/api/catalog_system/pub/...), que não é
bloqueada pelo robots.txt do site. Rotas bloqueadas (/busca, /img, /checkout...)
não são acessadas. Preços NÃO são coletados nem armazenados.

Uso:
  python3 scripts/coletar_giassi.py --categoria 11/84/326   # valida uma categoria
  python3 scripts/coletar_giassi.py                         # catálogo completo
"""
import argparse
import csv
import datetime as dt
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://www.giassi.com.br"
UA = "ListaComprasMaridos-catalogo/1.0 (coleta educada; 1 req/s)"
PAGE = 50
MAX_OFFSET = 2500  # limite da API de busca da VTEX
DELAY = 1.0

ROOT = Path(__file__).resolve().parent.parent

log_erros = []


def get_json(url, tentativas=3):
    for n in range(tentativas):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                total = r.headers.get("resources", "")
                dados = json.loads(r.read().decode("utf-8"), strict=False)
                time.sleep(DELAY)
                return dados, total
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            time.sleep(DELAY * (n + 2) * 2)
            erro = f"{url} -> {e}"
    log_erros.append(erro)
    print("ERRO", erro, file=sys.stderr)
    return None, ""


def urls_sitemap():
    """URLs de produto (/p) listadas nos sitemaps product-N.xml."""
    req = urllib.request.Request(f"{BASE}/sitemap.xml", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        indice = r.read().decode("utf-8")
    urls = set()
    for sm in re.findall(r"<loc>([^<]*/sitemap/product-\d+\.xml)</loc>", indice):
        with urllib.request.urlopen(urllib.request.Request(sm, headers={"User-Agent": UA}), timeout=30) as r:
            urls.update(re.findall(r"<loc>([^<]*/p)</loc>", r.read().decode("utf-8")))
        time.sleep(DELAY)
    return urls


def folhas(arvore, caminho=()):
    """Gera (ids, nomes) de cada categoria folha da árvore."""
    for c in arvore:
        ids = caminho + ((c["id"], c["name"]),)
        if c["children"]:
            yield from folhas(c["children"], ids)
        else:
            yield ids


def buscar_categoria(path_ids):
    produtos, offset = [], 0
    while offset < MAX_OFFSET:
        url = f"{BASE}/api/catalog_system/pub/products/search?fq=C:/{path_ids}/&_from={offset}&_to={offset + PAGE - 1}"
        dados, total = get_json(url)
        if not dados:
            break
        produtos.extend(dados)
        m = re.search(r"/(\d+)$", total)
        if len(dados) < PAGE or (m and offset + PAGE >= int(m.group(1))):
            break
        offset += PAGE
    if offset >= MAX_OFFSET:
        log_erros.append(f"Categoria {path_ids} excede {MAX_OFFSET} itens; resultado truncado")
    return produtos


# --- Extração de embalagem a partir do nome -------------------------------
UNIDADES = {
    "kg": "kg", "kilo": "kg", "quilo": "kg", "g": "g", "gr": "g", "grs": "g", "gramas": "g", "mg": "mg",
    "l": "L", "lt": "L", "lts": "L", "litro": "L", "litros": "L", "ml": "ml", "cl": "cl",
    "m": "m", "cm": "cm", "mm": "mm", "un": "un", "und": "un", "unid": "un", "unidades": "un", "unidade": "un",
    "cápsulas": "cápsulas", "capsulas": "cápsulas", "cp": "cápsulas", "comprimidos": "comprimidos",
    "sachês": "sachês", "saches": "sachês", "rolos": "rolos", "folhas": "folhas",
}
RE_GRANEL = re.compile(r"\bkg\s*$", re.I)  # "Banana Prata Kg": vendido por peso
_un = "|".join(sorted(map(re.escape, UNIDADES), key=len, reverse=True))
RE_MULTI = re.compile(rf"(?<![\w,.])(\d+)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*({_un})\b", re.I)
RE_SIMPLES = re.compile(rf"(?<![\w,.])(\d+(?:[.,]\d+)?)\s*({_un})\b", re.I)
RE_PAGUE = re.compile(r"\bpague\b", re.I)
RE_QTD = re.compile(r"\b(\d+)\s*(?:unidades|unid|und|un|rolos)\b", re.I)


def extrair_embalagem(nome):
    """Retorna (texto, valor, unidade, qtd_pack) encontrados literalmente no nome."""
    alvo = RE_PAGUE.split(nome)[0]  # "Leve 450ml Pague 360ml": vale o que se leva
    if not RE_SIMPLES.search(alvo):
        alvo = nome  # "Leve Mais Pague Menos Garrafa 600ml"
    m = RE_MULTI.search(alvo)
    if m:
        un = UNIDADES[m.group(3).lower()]
        if un in ("cm", "mm", "m"):  # "25x33cm" é dimensão, não pack
            return m.group(0), f"{m.group(1)}x{m.group(2)}", un, ""
        return m.group(0), m.group(2).replace(",", "."), un, m.group(1)
    achados = list(RE_SIMPLES.finditer(alvo))
    for m in achados:
        un = UNIDADES[m.group(2).lower()]
        if un == "un" and len(achados) > 1:
            continue  # prefere peso/volume a contagem de unidades quando ambos existem
        qtd = ""
        if un != "un":
            q = RE_QTD.search(alvo, m.end())  # "Pacote 1kg 8 Unidades"
            if q:
                qtd = q.group(1)
                return f"{m.group(0)} {q.group(0)}", m.group(1).replace(",", "."), un, qtd
        return m.group(0), m.group(1).replace(",", "."), un, qtd
    if RE_GRANEL.search(nome):
        return "Kg (vendido por peso)", "", "kg", ""
    return "", "", "", ""


def limpar_html(txt):
    txt = re.sub(r"<br\s*/?>", "\n", txt or "", flags=re.I)
    txt = re.sub(r"<[^>]+>", " ", txt)
    return re.sub(r"[ \t]+", " ", txt).strip()


def slug(txt):
    txt = unicodedata.normalize("NFKD", txt).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", txt.lower()).strip("-")


CAMINHOS = {}  # categoryId -> [nomes do departamento até a categoria]


def indexar_categorias(arvore, caminho=()):
    for c in arvore:
        CAMINHOS[str(c["id"])] = list(caminho + (c["name"],))
        indexar_categorias(c["children"], caminho + (c["name"],))


def normalizar(p):
    """Um registro por SKU (variante). Nenhum campo de preço é lido."""
    cats = sorted(p.get("categories") or [], key=lambda c: c.count("/"), reverse=True)
    folhas_prod = [c.strip("/").split("/") for c in cats
                   if not any(o != c and o.startswith(c) for o in cats)]
    # categoria principal = a que o site atribui ao produto (categoryId)
    niveis = CAMINHOS.get(str(p.get("categoryId"))) or (folhas_prod[0] if folhas_prod else [])
    secundarias = [" > ".join(f) for f in folhas_prod if f != niveis]
    descricao = limpar_html(p.get("description"))
    linhas = []
    for it in p.get("items") or []:
        nome = it.get("nameComplete") or it.get("name") or p.get("productName", "")
        emb_txt, emb_val, emb_un, emb_qtd = extrair_embalagem(nome)
        imgs = [i["imageUrl"].split("?")[0] for i in it.get("images") or []]
        linhas.append({
            "id": f"giassi-{it.get('itemId')}",
            "sku_id": it.get("itemId", ""),
            "produto_id": p.get("productId", ""),
            "ean": it.get("ean") or "",
            "codigo_referencia": p.get("productReference") or "",
            "nome": nome.strip(),
            "marca": (p.get("brand") or "").strip(),
            "descricao": descricao,
            "descricao_igual_nome": descricao.strip().lower() == nome.strip().lower(),
            "embalagem": emb_txt,
            "embalagem_valor": emb_val,
            "embalagem_unidade": emb_un,
            "embalagem_qtd_pack": emb_qtd,
            "unidade_venda": (p.get("unidade") or [""])[0],
            "multiplicador_venda": (p.get("multiplicador") or [""])[0],
            "departamento": niveis[0] if len(niveis) > 0 else "",
            "categoria": niveis[1] if len(niveis) > 1 else "",
            "subcategoria": niveis[2] if len(niveis) > 2 else "",
            "categoria_caminho": " > ".join(niveis),
            "categoria_slug": "/".join(slug(n) for n in niveis),
            "categorias_secundarias": " | ".join(secundarias),
            "url_produto": p.get("link") or f"{BASE}/{p.get('linkText')}/p",
            "imagem_url": imgs[0] if imgs else "",
            "imagens_urls": imgs,
            "imagem_arquivo": "",
            "imagem_uso_autorizado": False,
            "imagem_status": "requer_autorizacao" if imgs else "sem_imagem",
            "possivel_duplicata": False,
            "fonte": "giassi.com.br",
        })
    return linhas


CAMPOS_CSV = [k for k in normalizar({"items": [{}]})[0] if k != "imagens_urls"] + ["imagens_urls"]


def salvar(linhas, destino, meta):
    destino.mkdir(parents=True, exist_ok=True)
    with open(destino / "produtos.json", "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "produtos": linhas}, f, ensure_ascii=False, indent=2)
    with open(destino / "produtos.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS_CSV)
        w.writeheader()
        for l in linhas:
            w.writerow({**l, "imagens_urls": " | ".join(l["imagens_urls"])})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--categoria", help="caminho de ids, ex.: 11/84/326 (só valida essa categoria)")
    ap.add_argument("--saida", default=str(ROOT))
    ap.add_argument("--cache", help="pasta para guardar as respostas brutas da API")
    ap.add_argument("--reusar-cache", action="store_true",
                    help="não consulta as categorias de novo; parte do brutos.json do --cache")
    args = ap.parse_args()

    arvore, _ = get_json(f"{BASE}/api/catalog_system/pub/category/tree/3")
    if arvore is None:
        sys.exit("Não foi possível obter a árvore de categorias")
    indexar_categorias(arvore)
    if args.categoria:
        alvos = [args.categoria]
    else:
        alvos = ["/".join(str(i) for i, _ in f) for f in folhas(arvore)]

    brutos, por_categoria = {}, {}
    cache = Path(args.cache) / "brutos.json" if args.cache else None
    if args.reusar_cache and cache and cache.exists():
        brutos = {p["productId"]: p for p in json.load(open(cache, encoding="utf-8"))}
        print(f"cache: {len(brutos)} produtos", flush=True)
    else:
        for n, alvo in enumerate(alvos, 1):
            prods = buscar_categoria(alvo)
            por_categoria[alvo] = len(prods)
            for p in prods:
                brutos[p["productId"]] = p
            print(f"[{n}/{len(alvos)}] C:/{alvo}/ -> {len(prods)} produtos (únicos até agora: {len(brutos)})", flush=True)

    # Produtos vinculados a categorias intermediárias (ex.: /Mercearia/) não aparecem
    # na busca por categoria folha; completa a partir do sitemap, um a um.
    sem_retorno_api = []
    if not args.categoria:
        coletadas = {p.get("link") for p in brutos.values()}
        faltando = sorted(urls_sitemap() - coletadas)
        print(f"sitemap: {len(faltando)} URLs ainda não coletadas", flush=True)
        for n, url in enumerate(faltando, 1):
            link_text = url.rstrip("/").split("/")[-2]
            dados, _ = get_json(f"{BASE}/api/catalog_system/pub/products/search/{link_text}/p")
            if dados:
                brutos[dados[0]["productId"]] = dados[0]
            else:
                sem_retorno_api.append(url)
            if n % 100 == 0:
                print(f"[sitemap {n}/{len(faltando)}] únicos: {len(brutos)}", flush=True)

    if cache:
        cache.parent.mkdir(parents=True, exist_ok=True)
        with open(cache, "w", encoding="utf-8") as f:
            json.dump(list(brutos.values()), f, ensure_ascii=False)

    vistos, linhas = set(), []
    for p in brutos.values():
        for l in normalizar(p):
            if l["sku_id"] in vistos:
                continue
            vistos.add(l["sku_id"])
            linhas.append(l)
    linhas.sort(key=lambda l: (l["categoria_caminho"], l["nome"]))
    # Mesmo nome e marca com SKU/EAN diferentes: mantém ambos, mas sinaliza para revisão
    chave = lambda l: (l["nome"].lower(), l["marca"].lower())
    contagem = {}
    for l in linhas:
        contagem[chave(l)] = contagem.get(chave(l), 0) + 1
    for l in linhas:
        l["possivel_duplicata"] = contagem[chave(l)] > 1

    meta = {
        "fonte": BASE,
        "coletado_em": dt.datetime.now().isoformat(timespec="seconds"),
        "escopo": args.categoria or "catálogo completo (todas as categorias folha)",
        "total_produtos": len({l["produto_id"] for l in linhas}),
        "total_skus": len(linhas),
        "precos_coletados": False,
        "imagens": "Somente URLs. Site declara 'Todos os direitos reservados' e não há licença de reuso; "
                   "uso das imagens requer autorização do Giassi e/ou dos fabricantes.",
        "produtos_por_categoria_consultada": por_categoria,
        "urls_sitemap_sem_retorno_api": sem_retorno_api,
        "erros": log_erros,
    }
    salvar(linhas, Path(args.saida), meta)
    print(json.dumps({k: meta[k] for k in ("total_produtos", "total_skus", "erros")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
