import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'import', 'oxc'],
  categories: {
    correctness: 'error',
    suspicious: 'warn',
  },
  options: {
    typeAware: true,
  },
  env: {
    node: true,
    es2025: true,
  },
  ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/*.db'],
  rules: {
    'no-unused-vars': 'warn',
    eqeqeq: 'error',
    'typescript/no-explicit-any': 'warn',
    // Każda wartość unii (np. Verdict, status odpowiedzi) musi być obsłużona w switch.
    'typescript/switch-exhaustiveness-check': 'error',
    'typescript/no-misused-promises': 'error',
    'typescript/await-thenable': 'error',
    'import/no-cycle': 'error',
    // `export {}` to standardowy sposób oznaczenia pliku jako modułu.
    'unicorn/require-module-specifiers': 'off',
    // `test()` / `describe()` z node:test zwracają Promise, ale runner sam na nie czeka.
    'typescript/no-floating-promises': [
      'error',
      {
        allowForKnownSafeCalls: [
          { from: 'package', package: 'node:test', name: ['test', 'it', 'describe', 'suite'] },
        ],
      },
    ],
  },
});
