import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import NotificationToggle from '@/components/notifications/NotificationToggle';
import { Language } from '@/lib/translations';

interface DashboardHeaderProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  chwName: string;
  region?: string;
  onRefresh: () => void;
  refreshing: boolean;
}

const DashboardHeader = ({
  language,
  onLanguageChange,
  chwName,
  region,
  onRefresh,
  refreshing,
}: DashboardHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold text-sm">
              {language === 'en' ? 'CHW Dashboard' : 'Dashibodi ya CHW'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {chwName} {region && `• ${region}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NotificationToggle language={language} />
          <ThemeToggle />
          <LanguageToggle language={language} onToggle={onLanguageChange} />
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
