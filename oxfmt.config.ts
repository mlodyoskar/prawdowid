import { defineConfig } from 'oxfmt';

export default defineConfig({
  printWidth: 100,
  singleQuote: true,
  sortImports: true,
  ignorePatterns: ['**/node_modules/**', '**/dist/**', 'pnpm-lock.yaml'],
});
