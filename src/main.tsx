import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { ClusterProvider } from './cluster/ClusterProvider';
import { I18nProvider } from './i18n';
import { App } from './shell/App';
import { StoreProvider } from './state/store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <StoreProvider>
        <ClusterProvider>
          <App />
        </ClusterProvider>
      </StoreProvider>
    </I18nProvider>
  </StrictMode>,
);
