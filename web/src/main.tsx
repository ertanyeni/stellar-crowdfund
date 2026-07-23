import { Buffer } from 'buffer';
// stellar-sdk (XDR encoding) expects a global Buffer in the browser.
const g = globalThis as unknown as { Buffer?: typeof Buffer };
g.Buffer ||= Buffer;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
