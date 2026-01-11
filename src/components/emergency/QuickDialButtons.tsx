import { Phone, Ambulance, Shield, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t, Language } from '@/lib/translations';

interface QuickDialButtonsProps {
  language: Language;
}

const emergencyNumbers = [
  { name: 'Emergency', number: '999', icon: Phone, color: 'bg-destructive' },
  { name: 'Ambulance', number: '999', icon: Ambulance, color: 'bg-red-500' },
  { name: 'Police', number: '999', icon: Shield, color: 'bg-blue-600' },
  { name: 'Fire', number: '999', icon: Flame, color: 'bg-orange-500' },
];

const QuickDialButtons = ({ language }: QuickDialButtonsProps) => {
  const handleCall = (number: string) => {
    window.location.href = `tel:${number}`;
  };

  return (
    <div className="p-4 bg-muted/50 border-t">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
        {t('callEmergency', language)}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {emergencyNumbers.map((service) => (
          <Button
            key={service.name}
            variant="outline"
            className="flex flex-col items-center gap-1 h-auto py-3"
            onClick={() => handleCall(service.number)}
          >
            <div className={`h-10 w-10 rounded-full ${service.color} flex items-center justify-center`}>
              <service.icon className="h-5 w-5 text-white" />
            </div>
            <span className="text-xs font-medium">{service.name}</span>
          </Button>
        ))}
      </div>
    </div>
  );
};

export default QuickDialButtons;
