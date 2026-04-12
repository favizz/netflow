import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import DashboardPage from '@/pages/DashboardPage';
import InventoryPage from '@/pages/InventoryPage';
import UnitDetailPage from '@/pages/UnitDetailPage';
import ManagementPage from '@/pages/ManagementPage';
import TransactionsPage from '@/pages/TransactionsPage';
import LoginPage from '@/pages/LoginPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('admin-api-key');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
          <Route index element={<DashboardPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="inventory/:id" element={<UnitDetailPage />} />
          <Route path="management" element={<ManagementPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
