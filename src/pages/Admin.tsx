import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminSidebar, AdminMobileTabs } from '@/components/admin/AdminSidebar';
import { UsersTab } from '@/components/admin/UsersTab';
import { FacilitiesTab } from '@/components/admin/FacilitiesTab';
import { ProtocolsTab } from '@/components/admin/ProtocolsTab';
import { AuditLogsTab } from '@/components/admin/AuditLogsTab';
import { CHWManagementTab } from '@/components/admin/CHWManagementTab';
import { SMSDashboardTab } from '@/components/admin/SMSDashboardTab';
import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

const ReportsPage = lazy(() => import('@/pages/Reports'));
const AnalyticsDashboardTab = lazy(() => import('@/components/admin/AnalyticsDashboardTab'));
const SecurityEventsTab = lazy(() => import('@/components/admin/SecurityEventsTab'));
const BlockchainIntegrityTab = lazy(() => import('@/components/admin/BlockchainIntegrityTab'));
const CHWAnalyticsTab = lazy(() => import('@/components/admin/CHWAnalyticsTab'));
const MpesaConfigTab = lazy(() => import('@/components/admin/MpesaConfigTab'));

type AdminTab = 'users' | 'facilities' | 'protocols' | 'audit' | 'chw' | 'chwAnalytics' | 'sms' | 'reports' | 'analytics' | 'security' | 'integrity' | 'mpesa';

export default function Admin() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'users':
        return <UsersTab />;
      case 'chw':
        return <CHWManagementTab />;
      case 'chwAnalytics':
        return (
          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <CHWAnalyticsTab />
          </Suspense>
        );
      case 'facilities':
        return <FacilitiesTab />;
      case 'protocols':
        return <ProtocolsTab />;
      case 'sms':
        return <SMSDashboardTab />;
      case 'audit':
        return <AuditLogsTab />;
      case 'reports':
        return (
          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <ReportsPage embedded />
          </Suspense>
        );
      case 'analytics':
        return (
          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <AnalyticsDashboardTab />
          </Suspense>
        );
      case 'security':
        return (
          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <SecurityEventsTab />
          </Suspense>
        );
      case 'integrity':
        return (
          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <BlockchainIntegrityTab />
          </Suspense>
        );
      default:
        return <UsersTab />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              className="shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Admin Panel</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  System Management
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Mobile Tabs */}
        <AdminMobileTabs activeTab={activeTab} onTabChange={setActiveTab} />
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {renderTabContent()}
        </main>
      </div>
    </div>
  );
}
