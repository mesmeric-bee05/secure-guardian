import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminSidebar, AdminMobileTabs } from '@/components/admin/AdminSidebar';
import { UsersTab } from '@/components/admin/UsersTab';
import { FacilitiesTab } from '@/components/admin/FacilitiesTab';
import { ProtocolsTab } from '@/components/admin/ProtocolsTab';
import { AuditLogsTab } from '@/components/admin/AuditLogsTab';

type AdminTab = 'users' | 'facilities' | 'protocols' | 'audit';

export default function Admin() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'users':
        return <UsersTab />;
      case 'facilities':
        return <FacilitiesTab />;
      case 'protocols':
        return <ProtocolsTab />;
      case 'audit':
        return <AuditLogsTab />;
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
