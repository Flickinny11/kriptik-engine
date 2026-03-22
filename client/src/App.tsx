import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useUserStore } from '@/store/useUserStore';
import { Toaster } from 'sonner';
import { PageErrorBoundary } from '@/components/ui/error-boundary';

// Lazy load pages
const LandingPage = React.lazy(() => import('@/pages/LandingPage'));
const LoginPage = React.lazy(() => import('@/pages/LoginPage'));
const SignupPage = React.lazy(() => import('@/pages/SignupPage'));
const ForgotPasswordPage = React.lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = React.lazy(() => import('@/pages/ResetPasswordPage'));
const Dashboard = React.lazy(() => import('@/pages/Dashboard'));
const Builder = React.lazy(() => import('@/pages/Builder'));
const SettingsPage = React.lazy(() => import('@/pages/SettingsPage'));
const OpenSourceStudioPage = React.lazy(() => import('@/pages/OpenSourceStudioPage'));
const FixMyApp = React.lazy(() => import('@/pages/FixMyApp'));
const FixMyAppCredentials = React.lazy(() => import('@/pages/FixMyAppCredentials'));
const TrainingPage = React.lazy(() => import('@/pages/TrainingPage'));
const CredentialVault = React.lazy(() => import('@/pages/CredentialVault'));
const IntegrationsPage = React.lazy(() => import('@/pages/IntegrationsPage'));
const IntegrationsAuth = React.lazy(() => import('@/pages/IntegrationsAuth'));
const CompletedAppsPage = React.lazy(() => import('@/pages/CompletedAppsPage'));
const DesignRoom = React.lazy(() => import('@/pages/DesignRoom'));
const EndpointsPage = React.lazy(() => import('@/pages/EndpointsPage'));
const ManagerConsole = React.lazy(() => import('@/pages/ManagerConsole'));
const MyAccount = React.lazy(() => import('@/pages/MyAccount'));
const MyStuff = React.lazy(() => import('@/pages/MyStuff'));
const UsageDashboard = React.lazy(() => import('@/pages/UsageDashboard'));
const AILabPage = React.lazy(() => import('@/pages/AILabPage'));
const PrivacyPolicy = React.lazy(() => import('@/pages/PrivacyPolicy'));
const GitHubCallback = React.lazy(() => import('@/pages/GitHubCallback'));
const OAuthCallback = React.lazy(() => import('@/pages/OAuthCallback'));
const OpenAppPage = React.lazy(() => import('@/pages/OpenAppPage'));

// Layouts
const AuthLayout = React.lazy(() => import('@/components/layouts/AuthLayout'));

function Loading() {
  return (
    <div className="min-h-screen bg-kriptik-black flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-kriptik-lime border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useUserStore();
  const location = useLocation();
  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useUserStore();
  if (isLoading) return <Loading />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const initialize = useUserStore(s => s.initialize);
  useEffect(() => { initialize(); }, [initialize]);

  return (
    <>
      <PageErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Auth routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
            <Route path="/signup" element={<AuthRoute><SignupPage /></AuthRoute>} />
            <Route path="/forgot-password" element={<AuthRoute><ForgotPasswordPage /></AuthRoute>} />
            <Route path="/reset-password" element={<AuthRoute><ResetPasswordPage /></AuthRoute>} />
          </Route>

          {/* Protected app routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/builder/:projectId" element={<ProtectedRoute><Builder /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/open-source-studio" element={<ProtectedRoute><OpenSourceStudioPage /></ProtectedRoute>} />
          <Route path="/fix-my-app" element={<ProtectedRoute><FixMyApp /></ProtectedRoute>} />
          <Route path="/fix-my-app/credentials/:sessionId" element={<ProtectedRoute><FixMyAppCredentials /></ProtectedRoute>} />
          <Route path="/training" element={<ProtectedRoute><TrainingPage /></ProtectedRoute>} />
          <Route path="/vault" element={<ProtectedRoute><CredentialVault /></ProtectedRoute>} />
          <Route path="/integrations" element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />
          <Route path="/integrations-auth/:projectId" element={<ProtectedRoute><IntegrationsAuth /></ProtectedRoute>} />
          <Route path="/completed-apps" element={<ProtectedRoute><CompletedAppsPage /></ProtectedRoute>} />
          <Route path="/design-room" element={<ProtectedRoute><DesignRoom /></ProtectedRoute>} />
          <Route path="/endpoints" element={<ProtectedRoute><EndpointsPage /></ProtectedRoute>} />
          <Route path="/manager" element={<ProtectedRoute><ManagerConsole /></ProtectedRoute>} />
          <Route path="/account" element={<ProtectedRoute><MyAccount /></ProtectedRoute>} />
          <Route path="/my-stuff" element={<ProtectedRoute><MyStuff /></ProtectedRoute>} />
          <Route path="/usage" element={<ProtectedRoute><UsageDashboard /></ProtectedRoute>} />
          <Route path="/ai-lab" element={<ProtectedRoute><AILabPage /></ProtectedRoute>} />

          {/* OAuth callback routes */}
          <Route path="/oauth-callback" element={<OAuthCallback />} />
          <Route path="/github-callback" element={<GitHubCallback />} />

          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/open/:appSlug" element={<OpenAppPage />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </PageErrorBoundary>
      <Toaster theme="dark" position="bottom-right" />
    </>
  );
}
