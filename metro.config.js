// Metro: ignora a pasta de dados brutos do catálogo (≈11 mil fotos) para não
// vigiar nem empacotar esses arquivos. O app usa só assets/catalog/catalog.json.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const escape = (p) => p.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
const blocked = [path.join(__dirname, 'Banco de produtos'), path.join(__dirname, 'kit_marca_lista_de_compras')].map(
  (p) => new RegExp(`^${escape(p)}[/\\\\].*$`),
);
const existing = config.resolver.blockList;
config.resolver.blockList = existing ? [].concat(existing, blocked) : blocked;

module.exports = config;
