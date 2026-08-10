import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const typescriptConfig = {
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
  },
  plugins: {
    '@typescript-eslint': tsPlugin,
    'react-hooks': reactHooks,
  },
  rules: {
    ...tsPlugin.configs.recommended.rules,
    ...reactHooks.configs.recommended.rules,
    'no-undef': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
  },
};

const javascriptConfig = {
  ...js.configs.recommended,
  plugins: {
    'react-hooks': reactHooks,
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
  },
};

const scopedTypeScriptConfig = (files, environmentGlobals) => ({
  files,
  ...typescriptConfig,
  languageOptions: {
    ...typescriptConfig.languageOptions,
    globals: environmentGlobals,
  },
});

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...javascriptConfig,
  },
  {
    files: ['src/main/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/preload/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/renderer/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/shared/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.browser },
  },
  scopedTypeScriptConfig(['src/main/**/*.{ts,tsx}'], globals.node),
  scopedTypeScriptConfig(['src/preload/**/*.{ts,tsx}'], globals.node),
  scopedTypeScriptConfig(['src/renderer/**/*.{ts,tsx}'], globals.browser),
  scopedTypeScriptConfig(['src/shared/**/*.{ts,tsx}'], globals.browser),
];
