import { useState } from 'react';
import { AlertTriangle, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { t, Language } from '@/lib/translations';

interface EmergencyAlertModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: Language;
  userLocation: { lat: number; lng: number } | null;
  locationAddress?: string;
}

const priorities = [
  { value: 'low', labelEn: 'Low - Minor issue', labelSw: 'Chini - Tatizo dogo' },
  { value: 'medium', labelEn: 'Medium - Need help soon', labelSw: 'Wastani - Nahitaji msaada hivi karibuni' },
  { value: 'high', labelEn: 'High - Urgent', labelSw: 'Juu - Dharura' },
  { value: 'critical', labelEn: 'Critical - Life threatening', labelSw: 'Muhimu - Hatari kwa maisha' },
];

const EmergencyAlertModal = ({
  open,
  onOpenChange,
  language,
  userLocation,
  locationAddress,
}: EmergencyAlertModalProps) => {
  const [symptoms, setSymptoms] = useState('');
  const [priority, setPriority] = useState<string>('high');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!symptoms.trim()) {
      toast.error(language === 'en' ? 'Please describe the symptoms' : 'Tafadhali eleza dalili');
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error(language === 'en' ? 'Please log in to send alerts' : 'Tafadhali ingia kutuma tahadhari');
        return;
      }

      const { data, error } = await supabase.functions.invoke('emergency-alert', {
        body: {
          symptoms,
          priority,
          latitude: userLocation?.lat,
          longitude: userLocation?.lng,
          address: locationAddress,
        },
      });

      if (error) throw error;

      toast.success(t('alertSent', language));
      onOpenChange(false);
      setSymptoms('');
      setPriority('high');
    } catch (error) {
      console.error('Emergency alert error:', error);
      toast.error(language === 'en' ? 'Failed to send alert. Please try again.' : 'Imeshindikana kutuma tahadhari. Tafadhali jaribu tena.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t('emergencyAlert', language)}
          </DialogTitle>
          <DialogDescription>
            {language === 'en'
              ? 'Describe your emergency. This will alert your contacts and nearby health workers.'
              : 'Eleza dharura yako. Hii itawasiliana na mawasiliano yako na wafanyakazi wa afya wa karibu.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="symptoms">{t('symptoms', language)}</Label>
            <Textarea
              id="symptoms"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder={language === 'en' ? 'Describe the symptoms or emergency...' : 'Eleza dalili au dharura...'}
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">{t('priority', language)}</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {language === 'en' ? p.labelEn : p.labelSw}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-lg p-3">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="line-clamp-2">
              {userLocation
                ? locationAddress || `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`
                : language === 'en' ? 'Location not available' : 'Mahali haipatikani'}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('cancel', language)}
          </Button>
          <Button variant="destructive" onClick={handleSend} disabled={sending}>
            {sending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {language === 'en' ? 'Send Alert' : 'Tuma Tahadhari'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmergencyAlertModal;
