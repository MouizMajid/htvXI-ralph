import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n';
import './index.css';
import { KioskApp } from './kiosk/KioskApp';
import { Dashboard } from './staff/Dashboard';
import { StaffLogin } from './staff/StaffLogin';
import { RequireStaff } from './staff/RequireStaff';
import { ArtGallery } from './dev/ArtGallery';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/kiosk/*" element={<KioskApp />} />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route
            path="/staff"
            element={
              <RequireStaff>
                <Dashboard />
              </RequireStaff>
            }
          />
          <Route
            path="/staff/visit/:id"
            element={
              <RequireStaff>
                <Dashboard />
              </RequireStaff>
            }
          />
          <Route path="/dashboard" element={<Navigate to="/staff" replace />} />
          <Route path="/art" element={<ArtGallery />} />
          <Route path="*" element={<Navigate to="/kiosk" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
