import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import playwright from 'eslint-plugin-playwright';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    'node_modules/',
    'playwright-report/',
    'test-results/',
    'allure-results/',
    'allure-report/',
    'reports/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['tests/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      // Spec-local helpers that only assert, so tests calling them count as asserting.
      'playwright/expect-expect': ['warn', { assertFunctionNames: ['expectNoResults'] }],
      // The custom fixture provides the language option, translator and page objects.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['test', 'expect'],
              message: "Import test and expect from '@fixtures/test.fixture'.",
            },
          ],
        },
      ],
    },
  },
  {
    // Page objects hold locators and actions only; assertions belong in tests.
    files: ['src/pages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['expect'],
              message: 'Keep assertions in test files, not page objects.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
