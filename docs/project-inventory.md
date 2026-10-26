# Inventário inicial do projeto

Data da inspeção: 22/10/2026.

## Estado encontrado

A pasta `App Lista Compras/` **não tinha código nem repositório Git**. Havia só dois materiais:

| Pasta | Conteúdo |
|---|---|
| `kit_marca_lista_de_compras/` | Kit de marca oficial, já extraído (não havia `.zip` na pasta). |
| `Banco de produtos/` | Catálogo real coletado do site Giassi: CSV, JSON, imagens e scripts de coleta. |

Stack criada do zero: **Expo SDK 58 + React Native 0.88 + TypeScript 6 + Expo Router**, gerada com `create-expo-app` (template padrão) e depois enxugada.

## Kit de marca

| Arquivo | Uso no app |
|---|---|
| `design_tokens.json` | Fonte das cores, espaçamentos e raios. Copiado para `assets/brand/` e lido por `src/theme/tokens.ts`. |
| `app_icon.svg` / `app_icon.png` (1024×1024) | Ícone do app, splash e favicon. |
| `logo_horizontal.svg/.png` | Tela de login e aba Família → Sobre. |
| `logo_horizontal_claro.svg/.png` | Copiado para `assets/brand/` (versão para fundo escuro, ainda sem uso). |
| `brand_book_lista_de_compras.pdf` (8 páginas) | Lido por inteiro. Define o escopo do MVP, os componentes e os critérios de aceitação. |
| `painel_direcao_visual.png` | Referência visual das telas. |
| `kit_marca_lista_de_compras.zip` | **Não existe na pasta**: o kit já veio extraído. |

**Diferenças registradas:**
- No painel visual, o símbolo tem uma pequena folha na sacola. Os arquivos oficiais (`app_icon.svg` e o PDF) **não têm** essa folha. Segui os arquivos oficiais.
- Os tokens têm cores extras que o brand book não lista (`line`, `softgreen`, `success`, `warning`, `error`). Todas foram usadas como estão. A única cor criada aqui foi `errorSoft` (fundo claro de alerta, derivado de `error`), e ela está marcada em `tokens.ts`.
- As camadas do ícone adaptativo do Android (`assets/images/android-icon-*.png`) foram renderizadas a partir dos **mesmos traços** de `app_icon.svg`: o símbolo sem o quadrado de fundo, como exige o Android. Não foi feito redesenho.

## Catálogo de produtos

| Item | Valor |
|---|---|
| Fonte | giassi.com.br, coletado em 22/10/2026 (API pública VTEX + sitemap, respeitando o robots.txt) |
| Arquivos | `produtos.csv` (9,4 MB, UTF-8 com BOM), `produtos.json` (17,9 MB), `RELATORIO.md`, `urls_sem_dados.txt` |
| Produtos | **11.280 SKUs**, 1.428 marcas, 25 departamentos |
| Imagens | 11.234 fotos 500×500 (≈498 MB) em `imagens/<departamento>/<sku_id>.<ext>`; 45 com erro 404 na origem e 1 sem foto |
| Preços | Nenhum (correto: fora do escopo) |
| Variante | **Não existe campo de variante**: sabor, versão etc. aparecem só dentro do nome |
| Tamanho | Extraído do nome; 552 produtos ficaram sem tamanho |
| EAN | 11.278 preenchidos. **541 não são GTIN válidos** (códigos internos de 4 a 11 dígitos, como os de itens vendidos por peso) |
| Possíveis duplicatas | 43 marcadas na origem (`possivel_duplicata`) |
| Licença das fotos | **Desconhecida**: pertencem aos fabricantes ou ao Giassi |

Os detalhes do mapeamento e da validação estão em [catalog-import.md](catalog-import.md).

## Limitações de importação
- As fotos não entram no app nem no Git (são ≈500 MB). No modo demonstração, o app carrega as miniaturas do CDN de origem. Na produção, as fotos vão para o Supabase Storage pelo script, e isso depende da revisão de licença.
- A pasta `Banco de produtos/` (dados brutos) está no `.gitignore`. Só o catálogo compacto gerado (`assets/catalog/catalog.json`, 2,6 MB, sem imagens) entra no repositório.
