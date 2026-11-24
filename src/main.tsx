import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './admin/AdminApp';
import { PlayerApp } from './player/PlayerApp';
import { usePath } from './lib/router';
import './styles.css';

function App() {
  const path = usePath();
  return path.startsWith('/admin') ? <AdminApp path={path} /> : <PlayerApp />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
