import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminPage from './AdminPage';
import '../styles.css';
import './styles.css';
createRoot(document.getElementById('root')!).render(<StrictMode><AdminPage /></StrictMode>);
