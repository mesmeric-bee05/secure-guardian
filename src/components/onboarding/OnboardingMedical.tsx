import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MedicalData {
  bloodType: string;
  allergies: string;
  medicalConditions: string;
}

interface OnboardingMedicalProps {
  language: 'en' | 'sw';
  initialData: MedicalData;
  onNext: (data: MedicalData) => void;
  onBack: () => void;
  onSkip: () => void;
}

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const OnboardingMedical = ({ language, initialData, onNext, onBack, onSkip }: OnboardingMedicalProps) => {
  const [formData, setFormData] = useState<MedicalData>(initialData);

  const handleSubmit = () => {
    onNext(formData);
  };

  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          {language === 'en' ? 'Medical Information' : 'Taarifa za Matibabu'}
        </h2>
        <p className="text-muted-foreground mt-1">
          {language === 'en' 
            ? 'This helps emergency responders provide better care'
            : 'Hii inasaidia wahudumu wa dharura kutoa huduma bora'}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="bloodType">
            {language === 'en' ? 'Blood Type' : 'Kundi la Damu'}
          </Label>
          <Select
            value={formData.bloodType}
            onValueChange={(value) => setFormData({ ...formData, bloodType: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder={language === 'en' ? 'Select blood type' : 'Chagua kundi la damu'} />
            </SelectTrigger>
            <SelectContent>
              {bloodTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
              <SelectItem value="unknown">
                {language === 'en' ? "I don't know" : 'Sijui'}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="allergies">
            {language === 'en' ? 'Allergies' : 'Mzio'}
          </Label>
          <Textarea
            id="allergies"
            value={formData.allergies}
            onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
            placeholder={language === 'en' 
              ? 'List any allergies (e.g., penicillin, peanuts, bee stings)'
              : 'Orodhesha mzio wowote (mfano, penicillin, karanga)'}
            className="min-h-[80px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="conditions">
            {language === 'en' ? 'Medical Conditions' : 'Hali za Kimatibabu'}
          </Label>
          <Textarea
            id="conditions"
            value={formData.medicalConditions}
            onChange={(e) => setFormData({ ...formData, medicalConditions: e.target.value })}
            placeholder={language === 'en' 
              ? 'List any chronic conditions (e.g., diabetes, asthma, hypertension)'
              : 'Orodhesha hali zozote za muda mrefu (mfano, kisukari, pumu)'}
            className="min-h-[80px]"
          />
        </div>

        <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
          {language === 'en' 
            ? '🔒 This information is private and only shared with health workers during emergencies.'
            : '🔒 Taarifa hizi ni za faragha na zinashirikiwa tu na wafanyakazi wa afya wakati wa dharura.'}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            {language === 'en' ? 'Back' : 'Rudi'}
          </Button>
          <Button onClick={handleSubmit} className="flex-1">
            {language === 'en' ? 'Continue' : 'Endelea'}
          </Button>
        </div>
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
          {language === 'en' ? 'Skip for now' : 'Ruka kwa sasa'}
        </Button>
      </div>
    </div>
  );
};

export default OnboardingMedical;
