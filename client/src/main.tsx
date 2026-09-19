import { createRoot } from 'react-dom/client';
import App from './App';
import { AppDataProvider } from './hooks/AppDataContext';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <AppDataProvider>
    <App />
  </AppDataProvider>
);
