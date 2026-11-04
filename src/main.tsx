import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/index.css';
import { App } from './app/App';
import { startRuntime } from './app/runtime';

// Dev only: `?freeraf` keeps animation running in a hidden window, for render checks.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('freeraf')) {
  window.requestAnimationFrame = (cb) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => cb(performance.now());
    ch.port2.postMessage(0);
    return 0;
  };
}

startRuntime();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
