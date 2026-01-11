import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { profileSchema, ProfileFormData } from '@/lib/validations';
import { t, Language } from '@/lib/translations';
import { toast } from 'sonner';

interface ProfileFormProps {
  initialData: Partial<ProfileFormData>;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onSave: (data: ProfileFormData) => Promise<void>;
}

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const ProfileForm = ({ initialData, language, onLanguageChange, onSave }: ProfileFormProps) => {
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: initialData.fullName || '',
      phoneNumber: initialData.phoneNumber || '',
      bloodType: initialData.bloodType || '',
      allergies: initialData.allergies || '',
      medicalConditions: initialData.medicalConditions || '',
      dateOfBirth: initialData.dateOfBirth || '',
    },
  });

  const bloodType = watch('bloodType');

  const onSubmit = async (data: ProfileFormData) => {
    setSaving(true);
    try {
      await onSave(data);
      toast.success(t('profileUpdated', language));
    } catch (error) {
      toast.error(language === 'en' ? 'Failed to save profile' : 'Imeshindikana kuhifadhi wasifu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('editProfile', language)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t('fullName', language)}</Label>
            <Input
              id="fullName"
              {...register('fullName')}
              placeholder={language === 'en' ? 'Enter your full name' : 'Ingiza jina lako kamili'}
            />
            {errors.fullName && (
              <p className="text-xs text-destructive">{errors.fullName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">{t('phoneNumber', language)}</Label>
            <Input
              id="phoneNumber"
              type="tel"
              {...register('phoneNumber')}
              placeholder="+254 7XX XXX XXX"
            />
            {errors.phoneNumber && (
              <p className="text-xs text-destructive">{errors.phoneNumber.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">{t('dateOfBirth', language)}</Label>
            <Input
              id="dateOfBirth"
              type="date"
              {...register('dateOfBirth')}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('preferredLanguage', language)}</Label>
            <Select value={language} onValueChange={(v) => onLanguageChange(v as Language)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="sw">Kiswahili</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {language === 'en' ? 'Medical Information' : 'Taarifa za Kimatibabu'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('bloodType', language)}</Label>
            <Select
              value={bloodType || ''}
              onValueChange={(v) => setValue('bloodType', v as ProfileFormData['bloodType'])}
            >
              <SelectTrigger>
                <SelectValue placeholder={language === 'en' ? 'Select blood type' : 'Chagua kundi la damu'} />
              </SelectTrigger>
              <SelectContent>
                {bloodTypes.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allergies">{t('allergies', language)}</Label>
            <Textarea
              id="allergies"
              {...register('allergies')}
              placeholder={language === 'en' ? 'List any allergies (e.g., Penicillin, Peanuts)' : 'Orodhesha mizio yoyote (k.m., Penicillin, Karanga)'}
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="medicalConditions">{t('medicalConditions', language)}</Label>
            <Textarea
              id="medicalConditions"
              {...register('medicalConditions')}
              placeholder={language === 'en' ? 'List any medical conditions (e.g., Diabetes, Asthma)' : 'Orodhesha hali zozote za kimatibabu (k.m., Kisukari, Pumu)'}
              className="min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        {t('save', language)}
      </Button>
    </form>
  );
};

export default ProfileForm;
