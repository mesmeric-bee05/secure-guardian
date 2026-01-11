import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t, Language } from '@/lib/translations';

interface EmergencyAlertButtonProps {
  language: Language;
  onClick: () => void;
  className?: string;
}

const EmergencyAlertButton = ({ language, onClick, className }: EmergencyAlertButtonProps) => {
  return (
    <Button
      variant="destructive"
      size="lg"
      onClick={onClick}
      className={cn(
        "w-full gap-2 py-6 text-lg font-bold shadow-lg",
        "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600",
        "animate-pulse hover:animate-none",
        className
      )}
    >
      <AlertTriangle className="h-6 w-6" />
      {t('emergencyAlert', language)}
    </Button>
  );
};

export default EmergencyAlertButton;
