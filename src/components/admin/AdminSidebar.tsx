import { Users, Building2, FileText, ClipboardList, Shield, UserCog, MessageSquare, BarChart3, Activity, ShieldAlert, Link2, LineChart } from 'lucide-react';
import { cn } from '@/lib/utils';

type AdminTab = 'users' | 'facilities' | 'protocols' | 'audit' | 'chw' | 'chwAnalytics' | 'sms' | 'reports' | 'analytics' | 'security' | 'integrity';

interface AdminSidebarProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

const navItems = [
  { id: 'users' as const, label: 'User Management', icon: Users },
  { id: 'chw' as const, label: 'CHW Management', icon: UserCog },
  { id: 'chwAnalytics' as const, label: 'CHW Analytics', icon: LineChart },
  { id: 'facilities' as const, label: 'Facilities', icon: Building2 },
  { id: 'protocols' as const, label: 'First Aid Protocols', icon: FileText },
  { id: 'sms' as const, label: 'SMS Dashboard', icon: MessageSquare },
  { id: 'audit' as const, label: 'Audit Logs', icon: ClipboardList },
  { id: 'integrity' as const, label: 'Chain Integrity', icon: Link2 },
  { id: 'security' as const, label: 'Security Events', icon: ShieldAlert },
  { id: 'reports' as const, label: 'Reports', icon: BarChart3 },
  { id: 'analytics' as const, label: 'Analytics', icon: Activity },
];

export function AdminSidebar({ activeTab, onTabChange }: AdminSidebarProps) {
  return (
    <aside className="w-64 border-r border-border bg-card hidden lg:block">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Admin Panel</h2>
            <p className="text-xs text-muted-foreground">System Management</p>
          </div>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                activeTab === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}

export function AdminMobileTabs({ activeTab, onTabChange }: AdminSidebarProps) {
  return (
    <div className="flex lg:hidden border-b border-border overflow-x-auto">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onTabChange(item.id)}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2',
            activeTab === item.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <item.icon className="w-4 h-4" />
          {item.label}
        </button>
      ))}
    </div>
  );
}
