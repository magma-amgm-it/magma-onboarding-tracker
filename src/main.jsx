import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/global.css';
import App from './App.jsx';
import { initializeMsal } from './services/auth.js';

// Initialise MSAL (handles any redirect response) before rendering.
initializeMsal().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
