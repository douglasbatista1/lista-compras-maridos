// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'supabase/functions/*', 'Banco de produtos/*', 'kit_marca_lista_de_compras/*', 'scripts/catalog/out/*'],
  },
  {
    // testes usam require() dentro de jest.mock/isolateModules
    files: ['src/__tests__/**'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
