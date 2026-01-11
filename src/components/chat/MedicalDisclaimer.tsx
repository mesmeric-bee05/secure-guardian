import { AlertTriangle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t, Language } from '@/lib/translations';

interface MedicalDisclaimerProps {
  language: Language;
}

const MedicalDisclaimer = ({ language }: MedicalDisclaimerProps) => {
  const handleEmergencyCall = () => {
    window.location.href = 'tel:999';
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-800 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            {t('disclaimer', language)}
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleEmergencyCall}
          className="shrink-0 gap-1.5"
        >
          <Phone className="h-4 w-4" />
          <span>999</span>
        </Button>
      </div>
    </div>
  );
};

export default MedicalDisclaimer;
