import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import DashboardPage from '@/pages/DashboardPage';
import DevicesPage from '@/pages/DevicesPage';
import UnitDetailPage from '@/pages/UnitDetailPage';
import UsersPage from '@/pages/UsersPage';
import TransactionsPage from '@/pages/TransactionsPage';
import LogsPage from '@/pages/LogsPage';
import ControlCenterPage from '@/pages/ControlCenterPage';
import FAQPage from '@/pages/FAQPage';
import LoginPage from '@/pages/LoginPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem('admin-token'));

  if (!token) {
    return (
      <LoginPage
        onSuccess={(t) => {
          localStorage.setItem('admin-token', t);
          setToken(t);
        }}
      />
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
          <Route index element={<DashboardPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="devices/:id" element={<UnitDetailPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="control-center" element={<ControlCenterPage />} />
          <Route path="faq" element={<FAQPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
