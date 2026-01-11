import { useState } from 'react';
import { MapPin, User, Phone, Droplets, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Language, t } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface EmergencyCase {
  id: string;
  symptoms: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'escalated';
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  notes: string | null;
  resolution_notes: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
    phone_number: string | null;
    blood_type: string | null;
    allergies: string[] | null;
    medical_conditions: string[] | null;
  } | null;
}

interface CaseDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseData: EmergencyCase | null;
  language: Language;
  onUpdateStatus: (id: string, status: string, notes?: string) => Promise<void>;
}

const statusOptions = [
  { value: 'pending', labelEn: 'Pending', labelSw: 'Inasubiri' },
  { value: 'assigned', labelEn: 'Assigned', labelSw: 'Imepewa' },
  { value: 'in_progress', labelEn: 'In Progress', labelSw: 'Inaendelea' },
  { value: 'resolved', labelEn: 'Resolved', labelSw: 'Imekamilika' },
  { value: 'escalated', labelEn: 'Escalated', labelSw: 'Imeongezwa' },
];

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const CaseDetailModal = ({
  open,
  onOpenChange,
  caseData,
  language,
  onUpdateStatus,
}: CaseDetailModalProps) => {
  const [status, setStatus] = useState(caseData?.status || 'pending');
  const [notes, setNotes] = useState(caseData?.resolution_notes || '');
  const [saving, setSaving] = useState(false);

  // Reset state when case changes
  useState(() => {
    if (caseData) {
      setStatus(caseData.status);
      setNotes(caseData.resolution_notes || '');
    }
  });

  const handleSave = async () => {
    if (!caseData) return;
    
    setSaving(true);
    try {
      await onUpdateStatus(caseData.id, status, notes);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCall = () => {
    if (caseData?.profiles?.phone_number) {
      window.location.href = `tel:${caseData.profiles.phone_number}`;
    }
  };

  const handleDirections = () => {
    if (caseData?.location_lat && caseData?.location_lng) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${caseData.location_lat},${caseData.location_lng}`,
        '_blank'
      );
    }
  };

  if (!caseData) return null;

  const timeAgo = formatDistanceToNow(new Date(caseData.created_at), { addSuffix: true });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('caseDetails', language)}
            <Badge className={cn("text-xs", priorityColors[caseData.priority])}>
              {caseData.priority}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Symptoms */}
          <div>
            <Label className="text-xs text-muted-foreground">{t('symptoms', language)}</Label>
            <p className="text-sm mt-1">{caseData.symptoms}</p>
            <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
          </div>

          <Separator />

          {/* Patient Info */}
          {caseData.profiles && (
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">{t('patientInfo', language)}</Label>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{caseData.profiles.full_name}</span>
                </div>
                {caseData.profiles.phone_number && (
                  <Button size="sm" variant="outline" onClick={handleCall} className="gap-1">
                    <Phone className="h-4 w-4" />
                    {t('call', language)}
                  </Button>
                )}
              </div>

              {caseData.profiles.blood_type && (
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-red-500" />
                  <span className="text-sm">{caseData.profiles.blood_type}</span>
                </div>
              )}

              {caseData.profiles.allergies && caseData.profiles.allergies.length > 0 && (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div>
                    <span className="text-xs text-muted-foreground">{t('allergies', language)}:</span>
                    <p className="text-sm">{caseData.profiles.allergies.join(', ')}</p>
                  </div>
                </div>
              )}

              {caseData.profiles.medical_conditions && caseData.profiles.medical_conditions.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('medicalConditions', language)}:</span>
                  <p className="text-sm">{caseData.profiles.medical_conditions.join(', ')}</p>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Location */}
          {(caseData.location_address || caseData.location_lat) && (
            <div>
              <Label className="text-xs text-muted-foreground">{t('location', language)}</Label>
              <div className="flex items-center justify-between mt-1">
                <p className="text-sm flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {caseData.location_address || `${caseData.location_lat}, ${caseData.location_lng}`}
                </p>
                {caseData.location_lat && (
                  <Button size="sm" variant="outline" onClick={handleDirections}>
                    {t('getDirections', language)}
                  </Button>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Status Update */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('status', language)}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EmergencyCase['status'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {language === 'en' ? opt.labelEn : opt.labelSw}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">
                {language === 'en' ? 'Resolution Notes' : 'Maelezo ya Ufumbuzi'}
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={language === 'en' ? 'Add notes about the case...' : 'Ongeza maelezo kuhusu kesi...'}
                className="min-h-[80px]"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel', language)}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t('save', language)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CaseDetailModal;
