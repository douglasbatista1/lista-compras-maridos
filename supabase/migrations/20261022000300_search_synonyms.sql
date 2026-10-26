-- Sinônimos de busca: o termo digitado também casa com as expansões.
-- Ex.: "detergente" encontra "Lava-Louças". Mesma lista de src/domain/synonyms.json.
insert into public.search_synonyms (term, expansions) values
  ('detergente', array['lava loucas']),
  ('sabao', array['lava roupas']),
  ('bolacha', array['biscoito']),
  ('biscoito', array['bolacha']),
  ('macaxeira', array['mandioca', 'aipim']),
  ('mandioca', array['aipim']),
  ('aipim', array['mandioca']),
  ('xampu', array['shampoo']),
  ('desodorante', array['antitranspirante']),
  ('catchup', array['ketchup']),
  ('dente', array['dental']),
  ('yogurt', array['iogurte']),
  ('iogurte', array['yogurt']),
  ('sanitaria', array['alvejante']),
  ('salgadinho', array['snack'])
on conflict (term) do update set expansions = excluded.expansions;
