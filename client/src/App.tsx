import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useUserStore } from '@/store/useUserStore';
import { Toaster } from 'sonner';
import { PageErrorBoundary } from '@/components/ui/error-boundary';

// Lazy load pages
const LoginPage = React.lazy(() => import('@/pages/LoginPage'));
const SignupPage = React.lazy(() => import('@/pages/SignupPage'));
const ForgotPasswordPage = React.lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = React.lazy(() => import('@/pages/ResetPasswordPage'));
const Dashboard = React.lazy(() => import('@/pages/Dashboard'));
const Builder = React.lazy(() => import('@/pages/Builder'));
const SettingsPage = React.lazy(() => import('@/pages/SettingsPage'));

// Layouts
const AuthLayout = React.lazy(() => import('@/components/layouts/AuthLayout'));

function Loading() {
  return (
    <div className="min-h-screen bg-kriptik-black flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-kriptik-lime border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/**
 * Route protection — redirects to login if not authenticated.
 * Shows loading spinner while session is being checked.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useUserStore();
  const location = useLocation();

  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

/**
 * Auth route — redirects to dashboard if already authenticated.
 */
function AuthRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useUserStore();

  if (isLoading) return <Loading />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const initialize = useUserStore(s => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <>
      <PageErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Auth routes — redirect to dashboard if already logged in */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
            <Route path="/signup" element={<AuthRoute><SignupPage /></AuthRoute>} />
            <Route path="/forgot-password" element={<AuthRoute><ForgotPasswordPage /></AuthRoute>} />
            <Route path="/reset-password" element={<AuthRoute><ResetPasswordPage /></AuthRoute>} />
          </Route>

          {/* Protected app routes — require authentication */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/builder/:projectId" element={<ProtectedRoute><Builder /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

          {/* Landing page: redirect to dashboard if logged in, login if not */}
          <Route path="/" element={<AuthRedirect />} />

          {/* All other routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </PageErrorBoundary>
      <Toaster theme="dark" position="bottom-right" />
    </>
  );
}

function AuthRedirect() {
  const { isAuthenticated, isLoading } = useUserStore();
  if (isLoading) return <Loading />;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}
