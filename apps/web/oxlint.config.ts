import { defineConfig } from 'oxlint';

import base from '../../oxlint.config.ts';

export default defineConfig({
  extends: [base],
  plugins: [...(base.plugins ?? []), 'react', 'jsx-a11y'],
  env: {
    browser: true,
    node: false,
  },
  rules: {
    // Nowy JSX transform (React 17+) nie wymaga importu React.
    'react/react-in-jsx-scope': 'off',
    // Side-effect imports of stylesheets are how Vite loads CSS.
    'import/no-unassigned-import': ['warn', { allow: ['**/*.css'] }],
  },
});
