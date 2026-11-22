import './ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { CheckPage } from './app/check-page.tsx';
import { DesignPage } from './app/design-page.tsx';
import { WhatsAppDemoPage } from './app/whatsapp-demo-page.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root');

// A few pages only, so no router: the catalog lives at /design, the channel simulator at /whatsapp.
const path = window.location.pathname.replace(/\/+$/, '') || '/';

function Page() {
  if (path === '/design') return <DesignPage />;
  if (path === '/whatsapp') return <WhatsAppDemoPage />;
  return <CheckPage />;
}

createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
