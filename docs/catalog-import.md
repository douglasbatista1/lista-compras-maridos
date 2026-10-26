# Importação do catálogo

Script: `scripts/catalog/import_catalog.py`. Usa só a biblioteca padrão do Python 3.10+.
Entrada: `Banco de produtos/produtos.csv` (opção `--source-dir` para usar outra pasta).

| Comando | O que faz |
|---|---|
| `python3 scripts/catalog/import_catalog.py validate` | Valida e normaliza; grava `scripts/catalog/out/import_report.json` e `import_errors.jsonl` (ocorrências por linha) |
| `npm run catalog:build` (`build-app`) | Gera `assets/catalog/catalog.json`, o catálogo compacto do modo demonstração |
| `... sql --out arquivo.sql` | Gera SQL idempotente (`INSERT ... ON CONFLICT (source, source_id) DO UPDATE`) |
| `... push [--upload-images] [--limit N]` | Envia ao Supabase via REST em lotes de 500, com checkpoint para retomar |

## Mapeamento (CSV → `products`)
| Origem | Destino | Tratamento |
|---|---|---|
| `sku_id` | `source_id`; `id` = uuid5(`giassi:<sku>`) | Chave estável, idempotente |
| `produto_id`, `codigo_referencia`, `url_produto` | `source_product_id`, `source_ref_code`, `source_url` | Preservados |
| `ean` | `gtin` (se o dígito verificador GS1 for válido) e `source_ean_raw` (sempre) | **Nenhum código é inventado.** Códigos inválidos ou repetidos deixam `gtin` nulo |
| `nome` | `name` | Espaços normalizados |
| `marca` | `brand` e `brand_raw` | Grafias que só diferem em maiúsculas/minúsculas são unificadas; marca TODA EM MAIÚSCULAS vira Título ("FORNO DE MINAS" → "Forno de Minas") |
| — | `variant` | Nulo: a origem não tem esse campo. A variante está no nome |
| `descricao` | `description` | Nula quando apenas repete o nome |
| `departamento`, `categoria`, `subcategoria`, `categoria_caminho` | idem | — |
| `embalagem_valor`, `embalagem_unidade`, `embalagem_qtd_pack`, `embalagem` | `size_value`, `size_unit` (normalizada: `L`→`l`, `cápsulas`→`capsulas`), `pack_qty`, `size_label` ("500 g", "12 × 350 ml"), `size_raw` | — |
| `imagem_arquivo`, `imagem_url`, `imagem_status` | `image_path` (`giassi/<sku>.<ext>` no Storage), `image_source_url`, `image_status` | `image_license = 'desconhecida'` |
| `possivel_duplicata` | `needs_review` | **Não há mesclagem automática** |

As fotos nunca vão para colunas da tabela. Elas ficam no bucket público `product-images` (até 2 MB por arquivo; jpeg/png/webp).
**Decisão:** usar o Storage, e não fotos empacotadas no app, porque são ≈500 MB. No modo demonstração, o app usa a miniatura do CDN de origem (`/ids/<id>-240-240/...`).

## Resultado da validação (22/10/2026)
| Indicador | Quantidade |
|---|---|
| Linhas lidas / importadas | 11.280 / 11.280 |
| Erros bloqueantes | 0 |
| GTIN válido | 10.737 |
| EAN que não é GTIN (código interno; `gtin` nulo) | 541 |
| Marcas normalizadas | 278 |
| Sem tamanho identificado | 552 |
| Com foto local | 11.234 |
| Possíveis duplicatas (origem) | 43 |
| Grupos com nome + marca + tamanho iguais | 21 (mantidos separados; revisão manual) |

**Idempotência verificada:** em PostgreSQL local, o SQL gerado foi aplicado duas vezes e o total ficou em 11.280 nas duas (`scripts/db/test_local.sh`).

## Importação realizada (22/10/2026)
Projeto `lista-compras-maridos` (sa-east-1):
- **Produtos:** 11.280 em 12 s, sem falhas.
- **Fotos:** 11.234 em WebP 500×500, qualidade 80. Ocupam **192 MB no Storage** (eram 498 MB no original), sem falhas, enviadas em cerca de 6 min com 8 envios em paralelo.
- **Conferido:** a contagem no banco, a busca com acento e com sinônimo, e uma foto aberta pelo link público.

## Rodar a importação no Supabase
1. Aplique as migrações (ver o README).
2. Crie `.env.import.local` (ignorado pelo Git):
   ```
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<chave secreta — nunca no app>
   ```
3. Compacte as fotos: `python3 scripts/catalog/import_catalog.py compress-images` (precisa do Pillow; padrão 500 px, qualidade 80).
4. Teste com poucos produtos: `python3 scripts/catalog/import_catalog.py push --limit 50`
5. Importação completa com fotos: `python3 scripts/catalog/import_catalog.py push --upload-images`.
   Se cair, rode de novo: o checkpoint em `scripts/catalog/out/push_checkpoint.json` retoma de onde parou.
5. Falhas ficam em `scripts/catalog/out/push_failures.json`.

> As fotos somam ≈500 MB, metade do Storage do plano gratuito (1 GB). Avalie o espaço e, antes, a licença das fotos.

## Atualizar o catálogo
Rode a coleta de novo (`Banco de produtos/scripts/coletar_giassi.py` e depois `baixar_imagens.py`). Em seguida rode `validate`, `npm run catalog:build` e `push`. Produtos existentes são atualizados pelo mesmo id. Produtos que sumirem da origem **não** são apagados; marcá-los como `is_active = false` fica para uma próxima etapa.

## Sinônimos
`src/domain/synonyms.json` e a migração `...000300_search_synonyms.sql` precisam ter a mesma lista; um teste confere. Exemplo: "detergente" também encontra "Lava-Louças".
