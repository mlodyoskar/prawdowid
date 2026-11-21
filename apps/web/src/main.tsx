import './ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { CheckPage } from './app/check-page.tsx';
import { DesignPage } from './app/design-page.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root');

// Two pages only, so no router: the catalog lives at /design.
const path = window.location.pathname.replace(/\/+$/, '') || '/';

createRoot(root).render(
  <StrictMode>{path === '/design' ? <DesignPage /> : <CheckPage />}</StrictMode>,
);
