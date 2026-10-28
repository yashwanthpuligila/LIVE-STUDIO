import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ScreenInkPage } from './overlay/ScreenInkPage';
import { FloatingToolbarPage } from './overlay/FloatingToolbarPage';
import './index.css';

// The same bundle backs the studio window and the two draw-on-screen overlay windows
const route = window.location.hash.replace(/^#/, '');
const OverlayRoot = route === 'overlay-ink' ? ScreenInkPage : route === 'overlay-toolbar' ? FloatingToolbarPage : null;

if (OverlayRoot) {
  // Overlay windows are transparent; drop the studio's opaque page background
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  document.body.className = 'antialiased select-none overflow-hidden text-gray-100';
}

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      {OverlayRoot ? <OverlayRoot /> : <App />}
    </React.StrictMode>
  );
}
