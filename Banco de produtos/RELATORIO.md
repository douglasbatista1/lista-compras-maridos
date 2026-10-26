# Relatório da coleta — Giassi Supermercados

**Fonte:** https://www.giassi.com.br/  ·  **Data da coleta:** 22/10/2026  ·  **Script:** `scripts/coletar_giassi.py`

## Resultado

| Item | Quantidade |
|---|---|
| Produtos coletados (únicos, 1 linha por SKU) | **11.280** |
| Marcas distintas | 1.428 |
| Departamentos | 25 |
| Com marca | 11.280 (100%) |
| Com EAN (código de barras) | 11.278 |
| Com descrição | 11.275 |
| Com peso/volume/tamanho identificado | 10.728 (95,1%) |
| Com URL de imagem | 11.279 |
| Imagens baixadas (500×500 px, ~498 MB) | **11.234** (99,6%) |
| Preços coletados | **0** (nenhum campo de preço foi gravado) |

### Por departamento

| Departamento | Produtos | Departamento | Produtos |
|---|---|---|---|
| Mercearia | 3.448 | Pet Shop | 243 |
| Higiene e Beleza | 1.995 | Padaria e Confeitaria | 231 |
| Limpeza | 940 | Alimentos Especiais | 208 |
| Frios e Laticínios | 854 | Carnes e Aves | 155 |
| Bebidas não alcoólicas | 653 | Churrasco | 154 |
| Bebidas Alcoólicas | 638 | Descartáveis | 109 |
| Utensílios | 416 | Papelaria | 104 |
| Cantinho do Bebê | 413 | Vestuário | 73 |
| Hortifrúti | 277 | Peixaria | 36 |
| Congelados | 271 | Ferramentas | 33 |
| | | Lazer 17 · Eletrônicos 4 · Festa 4 · Brinquedos 3 · Casa 1 | |

## Arquivos entregues

| Arquivo | Conteúdo |
|---|---|
| `produtos.csv` | Tabela (UTF-8 com BOM, abre direto no Excel). Listas separadas por ` \| `. |
| `produtos.json` | `{ "meta": {...}, "produtos": [...] }`. `imagens_urls` vem como lista. |
| `imagens/<departamento>/<sku_id>.<ext>` | Foto principal de cada produto (png/jpg/webp). O caminho fica em `imagem_arquivo`. |
| `urls_sem_dados.txt` | 79 URLs do sitemap sem dados de produto (ver "Limitações"). |
| `scripts/coletar_giassi.py` | Coletor reutilizável para atualizar a base. |
| `scripts/baixar_imagens.py` | Baixa as fotos e atualiza o CSV/JSON. Pula as que já existem. |

### Campos

- **Identificação:** `id` (`giassi-<sku_id>`, chave sugerida para o app), `sku_id`, `produto_id`, `ean`, `codigo_referencia`.
- **Produto:** `nome`, `marca`, `descricao` e `descricao_igual_nome` (true quando o site só repete o nome).
- **Embalagem:** `embalagem` (trecho literal do nome, ex.: `12x350ml`, `1kg 8 Unidades`), `embalagem_valor`, `embalagem_unidade` e `embalagem_qtd_pack`. Também `unidade_venda` e `multiplicador_venda`, que são especificações do próprio site.
- **Categoria:** `departamento`, `categoria`, `subcategoria`, `categoria_caminho`, `categoria_slug` e `categorias_secundarias` (outras árvores onde o produto aparece).
- **Links:** `url_produto`, `imagem_url` e `imagens_urls`.
- **Imagem/controle:** `imagem_arquivo`, `imagem_uso_autorizado`, `imagem_status`, `possivel_duplicata` e `fonte`.

## Como foi feito

1. **Regras de acesso.** Li o `robots.txt`. Ele bloqueia `/busca`, `/img`, `/login`, `/checkout`, `/account`, `/quick-view` e `/espiar`, e nenhuma dessas rotas foi acessada. Usei a API pública de catálogo da plataforma VTEX (`/api/catalog_system/pub/...`) e o `sitemap.xml`, que não têm restrição. A coleta fez no máximo 1 requisição por segundo, com um User-Agent identificado.
2. **Validação.** Primeiro rodei só a categoria *Mercearia › Alimentos Básicos › Arroz* (59 produtos) e conferi os campos. A partir disso fiz dois ajustes: a categoria principal passou a ser a que o site atribui ao produto, e packs como "8 Unidades" passaram a ser reconhecidos.
3. **Catálogo por categoria.** Percorri as 357 categorias finais da árvore e obtive 9.361 produtos.
4. **Complemento pelo sitemap.** O sitemap lista 11.212 URLs. Os produtos ligados a categorias intermediárias (ex.: só "/Mercearia/") não aparecem na busca por categoria final. Por isso consultei individualmente as 1.998 URLs que faltavam: **1.919 retornaram dados**.
5. **Deduplicação.** Mantive uma linha por SKU. Não há EAN repetido. Cada tamanho, sabor ou variante é uma linha própria (ex.: Arroz Giassi 1kg e 5kg são dois registros).

## Imagens

Por decisão do responsável pelo app, baixei **somente a foto de cada produto**. Banners, ofertas e outros elementos do site ficaram de fora. As fotos vêm do CDN `giassi.vteximg.com.br/arquivos/...`, cuja rota o `robots.txt` do CDN libera explicitamente. Baixei a versão 500×500 px que o próprio CDN gera (~45 KB em média), com 4 conexões simultâneas e no máximo 4 requisições por segundo.

| `imagem_status` | Quantidade |
|---|---|
| `baixada` | 11.234 |
| `falha: 404` | 45 |
| `sem_imagem` | 1 (Pão de Alho Santa Massa 240g, sem foto no site) |

- **Fotos trocadas durante a coleta.** O site trocou o endereço de 147 fotos entre a coleta dos dados e o download. O script consulta de novo a API, atualiza `imagem_url` e baixa a foto nova, e assim recuperou 102 delas.
- **45 fotos quebradas no próprio site.** Até o endereço atual informado pelo Giassi devolve 404, nos dois CDNs. São 35 de Papelaria, 5 de Ferramentas, 2 de Eletrônicos, 2 de Festa e 1 de Brinquedos. A lista fica em `meta.imagens_falhas` no JSON. Rodar `baixar_imagens.py` mais tarde pode recuperá-las.
- **Direitos.** As fotos de embalagem pertencem aos fabricantes ou ao Giassi. Elas ficam publicamente acessíveis, mas o site não traz uma licença explícita de reuso. Se o app for publicado comercialmente, vale considerar essa questão.

## Limitações e pontos de atenção

- **79 URLs do sitemap sem dados** (`urls_sem_dados.txt`). A API devolve vazio e a página abre sem nenhum dado de produto (uma testada deu 404). Provavelmente são produtos desativados que continuam no sitemap. Não foram incluídos.
- **147 produtos ativos não constam no sitemap**, mas foram encontrados pelas categorias e estão incluídos.
- **Embalagem extraída do nome.** O site não tem um campo estruturado de peso/volume, então o valor sai do texto do nome. Em 552 produtos o nome não informa tamanho (chupetas, baralhos, alguns vinhos com nome cortado pelo site), e o campo ficou vazio. Itens vendidos a granel aparecem como `Kg (vendido por peso)`.
- **Descrição.** Em 4.833 produtos a descrição do site é igual ao nome (`descricao_igual_nome = true`). Não foi criada nenhuma descrição.
- **Subcategoria vazia em 3.084 produtos**, porque o próprio site os vincula a um nível mais alto da árvore.
- **Possíveis duplicatas.** 43 registros têm nome e marca idênticos a outro registro, mas EAN/SKU diferentes (ex.: duas "Sobrecoxa de Frango Congelada Sadia 1kg"). Foram mantidos e marcados com `possivel_duplicata = true` para revisão manual.
- **Marcas como cadastradas no site.** Há algumas inconsistências de origem, por exemplo maiúsculas/minúsculas ("FORNO DE MINAS") ou submarca no lugar da marca ("Nescau Cereal"). Não corrigi nada para não alterar o dado original. Vale normalizar antes da importação.
- **Retrato do dia.** O catálogo muda com frequência. Para atualizar, rode `python3 scripts/coletar_giassi.py` (cerca de 45 minutos) e em seguida `python3 scripts/baixar_imagens.py`. A coleta regrava os campos de imagem, e o download só baixa as fotos que ainda não existem.
