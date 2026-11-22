import './ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { CheckPage } from './app/check-page.tsx';
import { DesignPage } from './app/design-page.tsx';
import { EmailPreviewPage } from './app/email-preview-page.tsx';
import { WhatsAppDemoPage } from './app/whatsapp-demo-page.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root');

// A few pages only, so no router: the catalog lives at /design, the channel simulator at /whatsapp,
// the moderator e-mail preview at /maile.
const path = window.location.pathname.replace(/\/+$/, '') || '/';

function Page() {
  if (path === '/design') return <DesignPage />;
  if (path === '/whatsapp') return <WhatsAppDemoPage />;
  if (path === '/maile') return <EmailPreviewPage />;
  return <CheckPage />;
}

createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
