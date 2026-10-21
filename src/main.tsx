import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// ---------------------------------------------------------------------------
// Last-resort crash safety net.
// If something escapes React's error boundary (async task, third-party lib),
// we surface a readable banner instead of dying silently or half-rendering.
// ---------------------------------------------------------------------------
function mountGlobalErrorBanner(message: string) {
  if (document.getElementById('global-error-banner')) return;
  const el = document.createElement('div');
  el.id = 'global-error-banner';
  el.setAttribute(
    'style',
    [
      'position:fixed', 'left:16px', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'max-width:640px', 'margin:0 auto', 'padding:12px 16px', 'border-radius:12px',
      'background:#7f1d1d', 'color:#fff', 'font:600 13px/1.5 ui-sans-serif,system-ui,sans-serif',
      'box-shadow:0 10px 30px rgba(0,0,0,.35)', 'display:flex', 'gap:10px', 'align-items:flex-start',
    ].join(';')
  );
  el.textContent = message;
  const btn = document.createElement('button');
  btn.textContent = 'Dismiss';
  btn.setAttribute(
    'style',
    [
      'margin-left:auto', 'flex-shrink:0', 'cursor:pointer', 'border:0', 'border-radius:8px',
      'padding:6px 10px', 'font:700 12px ui-sans-serif,system-ui,sans-serif',
      'background:rgba(255,255,255,.18)', 'color:#fff',
    ].join(';')
  );
  btn.onclick = () => el.remove();
  el.appendChild(btn);
  document.body.appendChild(el);
}

window.addEventListener('error', (e) => {
  // eslint-disable-next-line no-console
  console.error('[Global]', e.error ?? e.message);
  if (e.message?.includes('ResizeObserver')) return; // benign loop noise
  mountGlobalErrorBanner('Something went wrong in the background. The dashboard is still usable — dismiss this and continue.');
});

window.addEventListener('unhandledrejection', (e) => {
  // eslint-disable-next-line no-console
  console.error('[Global promise]', e.reason);
  mountGlobalErrorBanner('A background file task failed. Your loaded tabs are untouched.');
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
