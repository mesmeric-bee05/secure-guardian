import { Phone, Navigation, Clock, Ambulance, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HealthFacility } from '@/hooks/useFacilities';
import { t, Language } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface FacilityCardProps {
  facility: HealthFacility;
  distance?: number;
  language: Language;
  isSelected?: boolean;
  onClick: () => void;
}

const facilityTypeLabels: Record<string, { en: string; sw: string }> = {
  hospital: { en: 'Hospital', sw: 'Hospitali' },
  clinic: { en: 'Clinic', sw: 'Kliniki' },
  pharmacy: { en: 'Pharmacy', sw: 'Duka la Dawa' },
  health_center: { en: 'Health Center', sw: 'Kituo cha Afya' },
};

const FacilityCard = ({ facility, distance, language, isSelected, onClick }: FacilityCardProps) => {
  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (facility.phone_number) {
      window.location.href = `tel:${facility.phone_number}`;
    }
  };

  const handleDirections = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (facility.latitude && facility.longitude) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}`,
        '_blank'
      );
    }
  };

  const typeLabel = facilityTypeLabels[facility.facility_type]?.[language] || facility.facility_type;

  return (
    <div
      onClick={onClick}
      className={cn(
        "p-4 border rounded-lg cursor-pointer transition-all",
        isSelected
          ? "border-primary bg-primary/5 shadow-md"
          : "hover:border-muted-foreground/30 hover:bg-muted/50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{facility.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">
              {typeLabel}
            </Badge>
            {facility.is_24_hours && (
              <Badge variant="outline" className="text-xs gap-1">
                <Clock className="h-3 w-3" />
                24h
              </Badge>
            )}
            {facility.has_ambulance && (
              <Badge variant="outline" className="text-xs gap-1 text-destructive border-destructive/30">
                <Ambulance className="h-3 w-3" />
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1">
            <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{facility.address}</span>
          </p>
          {distance !== undefined && (
            <p className="text-xs text-primary font-medium mt-1">
              {distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)} km`} {t('distance', language).toLowerCase()}
            </p>
          )}
        </div>
      </div>
      
      <div className="flex gap-2 mt-3">
        {facility.phone_number && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={handleCall}
          >
            <Phone className="h-4 w-4" />
            {t('call', language)}
          </Button>
        )}
        {facility.latitude && facility.longitude && (
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            onClick={handleDirections}
          >
            <Navigation className="h-4 w-4" />
            {t('getDirections', language)}
          </Button>
        )}
      </div>
    </div>
  );
};

export default FacilityCard;
