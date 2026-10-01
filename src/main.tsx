import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppServices } from './app/container';
import { registerServiceWorker, requestPersistentStorage } from './infrastructure';
import { App } from './ui/App';
import './ui/styles.css';

const services = createAppServices();
void requestPersistentStorage();
// The offline shell only exists in production builds; in development it would cache stale code.
if (import.meta.env.PROD) void registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
