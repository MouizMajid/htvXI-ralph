import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n';
import './index.css';
import { KioskApp } from './kiosk/KioskApp';
import { Queue } from './staff/Queue';
import { PatientView } from './staff/PatientView';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/kiosk/*" element={<KioskApp />} />
          <Route path="/staff" element={<Queue />} />
          <Route path="/staff/visit/:id" element={<PatientView />} />
          <Route path="*" element={<Navigate to="/kiosk" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
