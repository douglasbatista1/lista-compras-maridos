#!/usr/bin/env bash
# Sobe um PostgreSQL temporário, aplica o stub do Supabase + migrações, importa o catálogo
# real DUAS vezes (prova de idempotência) e roda o teste de isolamento RLS.
# Requer: initdb/pg_ctl/psql (PostgreSQL 15+ com contrib/pg_trgm) e python3.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"
export LC_ALL="${PGTEST_LOCALE:-en_US.UTF-8}"  # macOS: evita "postmaster became multithreaded"
export PGHOST="$TMP" PGPORT="$PORT" PGUSER="postgres" PGDATABASE="postgres"

cleanup() { pg_ctl -D "$TMP/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres --encoding=UTF8 --locale="$LC_ALL" >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/pg.log" start >/dev/null || { tail -20 "$TMP/pg.log"; exit 1; }
for _ in $(seq 1 30); do pg_isready -q && break; sleep 0.2; done

PSQL=(psql -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/scripts/db/supabase_local_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "Aplicando $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

if [ -f "$ROOT/Banco de produtos/produtos.csv" ]; then
  python3 "$ROOT/scripts/catalog/import_catalog.py" sql --out "$TMP/products.sql" >/dev/null
  "${PSQL[@]}" -f "$TMP/products.sql"
  first=$("${PSQL[@]}" -At -c "select count(*) from public.products")
  "${PSQL[@]}" -f "$TMP/products.sql"
  second=$("${PSQL[@]}" -At -c "select count(*) from public.products")
  echo "Importação: 1ª execução=$first produtos, 2ª execução=$second produtos"
  [ "$first" = "$second" ] || { echo "FALHA: importação não é idempotente"; exit 1; }
  "${PSQL[@]}" -At -c "select 'Busca \"cafe pilao\" (top 3): ' || string_agg(name || ' / ' || coalesce(size_label,''), ' | ') from (select * from public.search_products('cafe pilao', null, 3)) s"
  syn=$("${PSQL[@]}" -At -c "select count(*) from public.search_products('detergente ype 500', null, 50)")
  echo "Busca com sinônimo \"detergente ype 500\": $syn resultados"
  [ "$syn" -gt 0 ] || { echo "FALHA: sinônimo não funcionou no SQL"; exit 1; }
else
  echo "Catálogo real não encontrado; pulando teste de importação."
fi

"${PSQL[@]}" -f "$ROOT/scripts/db/rls_isolation_test.sql"
