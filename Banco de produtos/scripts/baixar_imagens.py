#!/usr/bin/env python3
"""Baixa a imagem principal de cada produto de produtos.json e atualiza CSV/JSON.

As fotos vêm do CDN do Giassi (giassi.vteximg.com.br/arquivos/...), rota liberada
no robots.txt do CDN. Só a foto do produto é baixada (nada de banners/ofertas).

Arquivos: imagens/<departamento-slug>/<sku_id>.<ext>
Já baixados são pulados, então dá para interromper e rodar de novo.

Uso:
  python3 scripts/baixar_imagens.py                    # todos
  python3 scripts/baixar_imagens.py --categoria "Mercearia > Alimentos Básicos > Arroz"
"""
import argparse
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coletar_giassi import BASE, ROOT, UA, get_json, salvar, slug  # noqa: E402

TAMANHO = 500  # px; o CDN da VTEX redimensiona via /ids/<id>-<largura>-<altura>/
TIPOS = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}

_trava = threading.Lock()
_ultimo = [0.0]


def url_redimensionada(url, tam):
    url = re.sub(r"/arquivos/ids/(\d+)/", rf"/arquivos/ids/\1-{tam}-{tam}/", url, count=1)
    return urllib.parse.quote(url, safe=":/?=&%")  # nomes com "m²", acentos etc.


def aguardar(intervalo):
    """Limita o ritmo global (entre todas as threads)."""
    with _trava:
        espera = _ultimo[0] + intervalo - time.monotonic()
        if espera > 0:
            time.sleep(espera)
        _ultimo[0] = time.monotonic()


def atualizar_url_imagem(prod):
    """O site às vezes troca o id da imagem; busca a URL atual do SKU na API."""
    link_text = prod["url_produto"].rstrip("/").split("/")[-2]
    dados, _ = get_json(f"{BASE}/api/catalog_system/pub/products/search/{link_text}/p")
    for it in (dados[0]["items"] if dados else []):
        if it.get("itemId") == prod["sku_id"]:
            imgs = [i["imageUrl"].split("?")[0] for i in it.get("images") or []]
            if imgs and imgs[0] != prod["imagem_url"]:
                prod["imagem_url"], prod["imagens_urls"] = imgs[0], imgs
                return True
    return False


def baixar(prod, pasta, tam, intervalo, renovou=False):
    if not prod["imagem_url"]:
        return prod["sku_id"], "", "sem_imagem"
    destino_dir = pasta / slug(prod["departamento"] or "sem-departamento")
    existentes = list(destino_dir.glob(f"{prod['sku_id']}.*"))
    if existentes:
        return prod["sku_id"], existentes[0].relative_to(ROOT).as_posix(), "baixada"
    url = url_redimensionada(prod["imagem_url"], tam)
    for n in range(3):
        aguardar(intervalo)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                tipo = r.headers.get_content_type()
                dados = r.read()
            if tipo not in TIPOS or not dados:
                return prod["sku_id"], "", f"falha: tipo {tipo}"
            destino_dir.mkdir(parents=True, exist_ok=True)
            arq = destino_dir / f"{prod['sku_id']}{TIPOS[tipo]}"
            arq.write_bytes(dados)
            return prod["sku_id"], arq.relative_to(ROOT).as_posix(), "baixada"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                if not renovou and atualizar_url_imagem(prod):
                    return baixar(prod, pasta, tam, intervalo, renovou=True)
                return prod["sku_id"], "", "falha: 404"
            erro = str(e)
            time.sleep(2 * (n + 1))
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            erro = str(e)
            time.sleep(2 * (n + 1))
    return prod["sku_id"], "", f"falha: {erro}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--categoria", help="só produtos com este categoria_caminho (teste)")
    ap.add_argument("--tamanho", type=int, default=TAMANHO)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--intervalo", type=float, default=0.25, help="segundos entre requisições (global)")
    args = ap.parse_args()

    arq_json = ROOT / "produtos.json"
    J = json.load(open(arq_json, encoding="utf-8"))
    produtos = J["produtos"]
    alvo = [p for p in produtos if not args.categoria or p["categoria_caminho"] == args.categoria]
    pasta = ROOT / "imagens"

    resultados, feitos = {}, 0
    with ThreadPoolExecutor(args.threads) as ex:
        for sku, arquivo, status in ex.map(lambda p: baixar(p, pasta, args.tamanho, args.intervalo), alvo):
            resultados[sku] = (arquivo, status)
            feitos += 1
            if feitos % 500 == 0:
                print(f"[{feitos}/{len(alvo)}]", flush=True)

    for p in produtos:
        if p["sku_id"] in resultados:
            arquivo, status = resultados[p["sku_id"]]
            p["imagem_arquivo"] = arquivo
            p["imagem_status"] = status
            p["imagem_uso_autorizado"] = status == "baixada"

    falhas = {s: st for s, (_, st) in resultados.items() if st.startswith("falha")}
    J["meta"]["imagens"] = (
        f"Foto principal de cada produto baixada do CDN do Giassi em {args.tamanho}x{args.tamanho}px "
        "para imagens/<departamento>/<sku_id>.<ext>. Apenas fotos de produto; banners e demais "
        "elementos do site não foram baixados.")
    J["meta"]["imagens_falhas"] = falhas
    salvar(produtos, ROOT, J["meta"])
    ok = sum(1 for _, st in resultados.values() if st == "baixada")
    print(json.dumps({"processados": len(alvo), "baixadas": ok, "falhas": len(falhas),
                      "sem_imagem": sum(1 for _, st in resultados.values() if st == "sem_imagem")}))


if __name__ == "__main__":
    main()
