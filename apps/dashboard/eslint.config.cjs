const js = require('../../node_modules/@eslint/js');
const globals = require('../../node_modules/globals');
module.exports = [
  { ignores: ['public/assets/**', 'supabase/functions/**/index.ts'] },
  js.configs.recommended,
  { files: ['**/*.js', '**/*.mjs', '**/*.cjs'], languageOptions: { ecmaVersion: 2022, globals: { ...globals.node, ...globals.browser }, sourceType: 'commonjs' }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'no-redeclare': ['error', { builtinGlobals: false }] } },
  { files: ['**/*.mjs'], languageOptions: { sourceType: 'module' } },
];
