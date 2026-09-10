import js from '@eslint/js';
import globals from 'globals';

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  // Apply ESLint recommended rules to all JS source files
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,

      // Node.js / Express best practices
      'no-console': 'off',         // Console is used intentionally in logger/db
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_|next' }],
      'no-undef': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // Ignore generated / third-party directories
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'build/**',
      'tests/**',
    ],
  },
];
