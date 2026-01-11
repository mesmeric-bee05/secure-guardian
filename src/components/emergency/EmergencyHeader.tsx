import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { t, Language } from '@/lib/translations';

interface EmergencyHeaderProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

const EmergencyHeader = ({ language, onLanguageChange }: EmergencyHeaderProps) => {
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
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h1 className="font-semibold text-sm">{t('emergency', language)}</h1>
              <p className="text-xs text-muted-foreground">{t('findNearby', language)}</p>
            </div>
          </div>
        </div>
        <LanguageToggle language={language} onToggle={onLanguageChange} />
      </div>
    </header>
  );
};

export default EmergencyHeader;
