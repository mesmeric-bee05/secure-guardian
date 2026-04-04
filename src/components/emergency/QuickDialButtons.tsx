import { Phone, Ambulance, Shield, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Language } from '@/lib/translations';
import { toast } from 'sonner';

interface QuickDialButtonsProps {
  language: Language;
}

const emergencyNumbers = [
  { nameEn: 'Emergency', nameSw: 'Dharura', number: '999', icon: Phone, color: 'bg-destructive' },
  { nameEn: 'Ambulance', nameSw: 'Ambulensi', number: '999', icon: Ambulance, color: 'bg-red-500' },
  { nameEn: 'Police', nameSw: 'Polisi', number: '999', icon: Shield, color: 'bg-blue-600' },
  { nameEn: 'Fire', nameSw: 'Moto', number: '999', icon: Flame, color: 'bg-orange-500' },
];

const QuickDialButtons = ({ language }: QuickDialButtonsProps) => {
  const handleCall = (number: string, serviceName: string) => {
    const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
    
    if (isMobile) {
      window.location.href = `tel:${number}`;
      return;
    }

    // Desktop fallback: copy number and show toast
    navigator.clipboard?.writeText(number).then(() => {
      toast.success(
        language === 'en'
          ? `Call ${serviceName}: ${number} (copied to clipboard)`
          : `Piga simu ${serviceName}: ${number} (imenakiliwa)`,
      );
    }).catch(() => {
      toast.info(
        language === 'en'
          ? `Call ${serviceName}: ${number}`
          : `Piga simu ${serviceName}: ${number}`,
      );
    });

    if (!navigator.clipboard) {
      toast.info(
        language === 'en'
          ? `Call ${serviceName}: ${number}`
          : `Piga simu ${serviceName}: ${number}`,
      );
    }
  };

  return (
    <div className="p-4 bg-muted/50 border-t">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
        {language === 'en' ? 'Call Emergency Services' : 'Piga Simu Huduma za Dharura'}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {emergencyNumbers.map((service) => {
          const name = language === 'en' ? service.nameEn : service.nameSw;
          return (
            <Button
              key={service.nameEn}
              variant="outline"
              className="flex flex-col items-center gap-1 h-auto py-3"
              onClick={() => handleCall(service.number, name)}
            >
              <div className={`h-10 w-10 rounded-full ${service.color} flex items-center justify-center`}>
                <service.icon className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-medium">{name}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};

export default QuickDialButtons;
