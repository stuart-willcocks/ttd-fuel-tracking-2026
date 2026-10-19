import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './AdminApp';

const rootEl = document.getElementById('admin-root');

if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <AdminApp />
    </StrictMode>
  );
} else {
  console.error('Fatal: #admin-root container not found in DOM.');
}
