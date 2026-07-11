import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useAuthStore } from './stores/authStore';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminProtectedRoute } from './components/admin/AdminProtectedRoute';
import { AdminLayout } from './components/admin/AdminLayout';
import { DashboardPage } from './pages/DashboardPage';
import { InboxPage } from './pages/InboxPage';
import { ContactsPage } from './pages/ContactsPage';
import { ContactDetailPage } from './pages/ContactDetailPage';
import { PipelinePage } from './pages/PipelinePage';
import { AutomationsPage } from './pages/AutomationsPage';
import { FlowBuilderPage } from './pages/FlowBuilderPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PhoneNumbersPage } from './pages/PhoneNumbersPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminTenantsPage } from './pages/admin/AdminTenantsPage';
import { AdminTenantDetailPage } from './pages/admin/AdminTenantDetailPage';
import { AdminMetricsPage } from './pages/admin/AdminMetricsPage';
import { AdminHealthPage } from './pages/admin/AdminHealthPage';
import { AdminWebhookPage } from './pages/admin/AdminWebhookPage';
import { AdminAuditPage } from './pages/admin/AdminAuditPage';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60 * 1000 } },
});

function WcrmRoutes() {
  const { user, isLoading, fetchUser } = useAuthStore();

  useEffect(() => { fetchUser(); }, [fetchUser]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-3">
        <div className="text-2xl font-bold text-primary">WhatsApp CRM</div>
        <p className="text-muted-foreground text-sm">Log into the CRM first to access this panel.</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route index element={<Navigate to="inbox" replace />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="inbox" replace />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="inbox/:conversationId" element={<InboxPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="contacts/:id" element={<ContactDetailPage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="automations" element={<AutomationsPage />} />
          <Route path="automations/new" element={<FlowBuilderPage />} />
          <Route path="automations/:id" element={<FlowBuilderPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="phone-numbers" element={<PhoneNumbersPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="templates/new" element={<TemplateEditorPage />} />
          <Route path="templates/:id" element={<TemplateEditorPage />} />
        </Route>
      </Route>
      <Route element={<AdminProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="admin" element={<AdminDashboardPage />} />
          <Route path="admin/tenants" element={<AdminTenantsPage />} />
          <Route path="admin/tenants/:id" element={<AdminTenantDetailPage />} />
          <Route path="admin/metrics" element={<AdminMetricsPage />} />
          <Route path="admin/health" element={<AdminHealthPage />} />
          <Route path="admin/webhooks" element={<AdminWebhookPage />} />
          <Route path="admin/audit" element={<AdminAuditPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function WhatsAppCRMPanel() {
  return (
    <div className="panel-wcrm">
      <QueryClientProvider client={queryClient}>
        <Toaster position="top-right" richColors />
        <WcrmRoutes />
      </QueryClientProvider>
    </div>
  );
}
