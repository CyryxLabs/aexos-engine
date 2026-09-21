// @ts-check
const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

/**
 * CYRYX Framework ESLint Configuration
 * ESLint v9 flat config format
 * @type {import('eslint').Linter.Config[]}
 */
module.exports = [
  // Recommended JavaScript rules
  js.configs.recommended,

  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/.git',
      '**/.git/**',
      '**/.hg',
      '**/.hg/**',
      '**/.svn',
      '**/.svn/**',
      '**/coverage/**',
      '**/build/**',
      '**/dist/**',
      '**/.next/**',
      '**/.vercel/**',
      // Dashboard has its own ESLint config
      'apps/dashboard/**',
      '**/.aexos-core/_legacy-v4.31.0/**',
      '**/web-bundles/**',
      '**/*.min.js',
      '**/aexos-core/*.js',
      '**/templates/squad/**',
      // Squad template - ES modules with placeholder imports
      '.aexos-core/development/templates/squad-template/**',
      // ESM bundle files - auto-generated
      '**/*.esm.js',
      '**/index.esm.js',
      // Legacy and backup files
      '**/*.backup*.js',
      '**/aexos-init-old.js',
      '**/aexos-init-v4.js',
      // Scripts that need cleanup (TODO: fix in Story 6.2)
      '.aexos-core/quality/**',
      '.aexos-core/scripts/**',
      // Development scripts with known ESLint errors (TODO: fix in future story)
      '.aexos-core/development/scripts/**',
      // CLI files with legacy issues (TODO: fix)
      '.aexos-core/cli/**',
      '.aexos-core/infrastructure/scripts/**',
      // Bin files with legacy issues
      'bin/aexos-init*.js',
      'bin/migrate-*.js',
      // Template files with placeholder syntax
      '.aexos-core/product/templates/**',
      // Health Dashboard - uses Vite/React with ES modules
      'tools/health-dashboard/**',
      // Core orchestration/execution - legacy code with no-undef errors (TODO: fix)
      '.aexos-core/core/orchestration/**',
      '.aexos-core/core/execution/**',
      // Hook integrations - legacy code (TODO: fix)
      '.aexos-core/hooks/**',
      // Pro module - legacy code
      'pro/**',
      // Glue scripts
      'scripts/glue/**',
      // Ephemeral test dirs created at repo root by Jest suites.
      // Trailing-slash form skips the directory in the walker entirely
      // (no readdir), avoiding ENOENT races when concurrent test runs
      // delete these dirs mid-scan; the /** form alone still descends.
      '.test-temp*/',
      '.test-temp*/**',
      '.aexos-test/',
      '.aexos-test/**',
      'tests/**/temp-*/',
      'tests/**/temp-*/**',
    ],
  },

  // JavaScript files configuration
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js globals
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        global: 'readonly',
        // Node.js 18+ globals
        fetch: 'readonly',
        AbortController: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        structuredClone: 'readonly',
        // Jest globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      // Error prevention
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'error',
      'no-console': 'off', // We need console for CLI tool

      // Code style
      semi: ['error', 'always'],
      quotes: ['warn', 'single', { avoidEscape: true }],
      indent: ['warn', 2, { SwitchCase: 1 }],
      'comma-dangle': ['warn', 'always-multiline'],

      // Best practices
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-throw-literal': 'error',

      // Relaxed rules for legacy code (TODO: fix and re-enable as errors)
      'no-case-declarations': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      'no-prototype-builtins': 'warn',
      'no-empty': 'warn',
    },
  },

  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript resolves runtime and type globals through the applicable
      // tsconfig/lib declarations. The base ESLint rule cannot distinguish
      // type names from runtime identifiers and reports false positives.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Nested Vite configuration files belong to an ESM package even though the
  // AEXOS repository itself uses CommonJS for root-level JavaScript.
  {
    files: ['squads/legal-analyst/webapp/frontend/*.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },

  // Native squads include self-contained CLIs, examples, and an embedded Vite
  // application with their own style conventions. Root lint still enforces
  // correctness, while style/unused diagnostics remain the responsibility of
  // each nested runtime's own toolchain.
  {
    files: [
      'squads/apex/examples/**/*.{js,cjs,mjs,ts,tsx}',
      'squads/apex/scripts/**/*.{js,cjs,mjs,ts,tsx}',
      'squads/deep-research/scripts/**/*.{js,cjs,mjs,ts,tsx}',
      'squads/kaizen-v2/scripts/**/*.{js,cjs,mjs,ts,tsx}',
      'squads/legal-analyst/webapp/frontend/**/*.{js,cjs,mjs,ts,tsx}',
      'squads/squad-creator/scripts/**/*.{js,cjs,mjs,ts,tsx}',
    ],
    rules: {
      'no-unused-vars': 'off',
      'prefer-const': 'off',
      'no-useless-escape': 'off',
      quotes: 'off',
      'comma-dangle': 'off',
    },
  },
  {
    files: [
      'squads/apex/examples/**/*.{ts,tsx}',
      'squads/deep-research/scripts/**/*.{ts,tsx}',
      'squads/legal-analyst/webapp/frontend/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Test files - more relaxed rules
  {
    files: ['**/*.test.js', '**/*.spec.js', '**/tests/**/*.js'],
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off', // Jest globals
    },
  },

  // Browser-side assets (landing page) - browser globals, ES modules
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        IntersectionObserver: 'readonly',
        matchMedia: 'readonly',
        requestAnimationFrame: 'readonly',
      },
    },
  },
];
