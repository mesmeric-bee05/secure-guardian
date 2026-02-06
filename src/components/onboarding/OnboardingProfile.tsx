import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProfileData {
  fullName: string;
  phoneNumber: string;
  preferredLanguage: 'en' | 'sw';
  dateOfBirth: string;
}

interface OnboardingProfileProps {
  language: 'en' | 'sw';
  initialData: ProfileData;
  onNext: (data: ProfileData) => void;
  onBack: () => void;
}

const OnboardingProfile = ({ language, initialData, onNext, onBack }: OnboardingProfileProps) => {
  const [formData, setFormData] = useState<ProfileData>(initialData);
  const [errors, setErrors] = useState<Partial<ProfileData>>({});

  const validate = (): boolean => {
    const newErrors: Partial<ProfileData> = {};
    
    if (!formData.fullName.trim()) {
      newErrors.fullName = language === 'en' ? 'Name is required' : 'Jina linahitajika';
    }
    
    if (formData.phoneNumber && !/^[+]?[\d\s-]{10,15}$/.test(formData.phoneNumber.replace(/\s/g, ''))) {
      newErrors.phoneNumber = language === 'en' ? 'Invalid phone number' : 'Nambari ya simu si sahihi';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      onNext(formData);
    }
  };

  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          {language === 'en' ? 'Set Up Your Profile' : 'Weka Wasifu Wako'}
        </h2>
        <p className="text-muted-foreground mt-1">
          {language === 'en' 
            ? 'This helps us personalize your experience'
            : 'Hii inatusaidia kukubinafsishia uzoefu wako'}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">
            {language === 'en' ? 'Full Name' : 'Jina Kamili'} *
          </Label>
          <Input
            id="fullName"
            value={formData.fullName}
            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            placeholder={language === 'en' ? 'Enter your full name' : 'Ingiza jina lako kamili'}
          />
          {errors.fullName && (
            <p className="text-sm text-destructive">{errors.fullName}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phoneNumber">
            {language === 'en' ? 'Phone Number' : 'Nambari ya Simu'}
          </Label>
          <Input
            id="phoneNumber"
            type="tel"
            value={formData.phoneNumber}
            onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
            placeholder="+254 700 000 000"
          />
          {errors.phoneNumber && (
            <p className="text-sm text-destructive">{errors.phoneNumber}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {language === 'en' 
              ? 'Used for SMS alerts and emergency contact'
              : 'Inatumika kwa tahadhari za SMS na mawasiliano ya dharura'}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language">
            {language === 'en' ? 'Preferred Language' : 'Lugha Unayopendelea'}
          </Label>
          <Select
            value={formData.preferredLanguage}
            onValueChange={(value: 'en' | 'sw') => setFormData({ ...formData, preferredLanguage: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="sw">Kiswahili</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dob">
            {language === 'en' ? 'Date of Birth' : 'Tarehe ya Kuzaliwa'}
            <span className="text-muted-foreground ml-1">
              ({language === 'en' ? 'optional' : 'si lazima'})
            </span>
          </Label>
          <Input
            id="dob"
            type="date"
            value={formData.dateOfBirth}
            onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          {language === 'en' ? 'Back' : 'Rudi'}
        </Button>
        <Button onClick={handleSubmit} className="flex-1">
          {language === 'en' ? 'Continue' : 'Endelea'}
        </Button>
      </div>
    </div>
  );
};

export default OnboardingProfile;
