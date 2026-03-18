import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useUserStore } from '@/store/useUserStore';
import { Toaster } from 'sonner';

// Lazy load pages
const LoginPage = React.lazy(() => import('@/pages/LoginPage'));
const SignupPage = React.lazy(() => import('@/pages/SignupPage'));
const Dashboard = React.lazy(() => import('@/pages/Dashboard'));
const Builder = React.lazy(() => import('@/pages/Builder'));

// Layouts
const AuthLayout = React.lazy(() => import('@/components/layouts/AuthLayout'));

function Loading() {
  return (
    <div className="min-h-screen bg-kriptik-black flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-kriptik-lime border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const initialize = useUserStore(s => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Auth routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          {/* App routes */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/builder/:projectId" element={<Builder />} />

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
      <Toaster theme="dark" position="bottom-right" />
    </>
  );
}
