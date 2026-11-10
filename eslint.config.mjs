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
    // iOS functional specs (tests-ios/): the same rules as tests/, scoped to tests-ios only.
    files: ['tests-ios/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['test', 'expect'],
              message: "Import test and expect from '@fixtures/ios.fixture'.",
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
  {
    // UI visual and localization layer: guest-only and read-only. Specs take test and expect from
    // ui-tests/support/fixtures.ts, never from the functional fixtures, API clients or credentials.
    files: ['ui-tests/**/*.ts'],
    ignores: ['ui-tests/support/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['test', 'expect'],
              message: "Import test and expect from 'ui-tests/support/fixtures'.",
            },
          ],
          patterns: [
            {
              group: ['@fixtures/*', '@api/*', '@mobile/*', '@config/*', '@test-data/*'],
              message: 'The UI layer is guest-only: no functional fixtures, API or credentials.',
            },
          ],
        },
      ],
    },
  },
  {
    // The UI layer never types into, selects in or submits forms, and never writes inline snapshots.
    files: ['ui-tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(fill|type|pressSequentially|press|check|uncheck|setChecked|selectOption|setInputFiles|submit|requestSubmit|toMatchAriaSnapshot)$/]',
          message: 'The UI layer is display-only: no form input, submission or inline snapshots.',
        },
      ],
    },
  },
  prettier,
);
