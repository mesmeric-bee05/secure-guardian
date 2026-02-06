import { useState } from 'react';
import { Plus, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EmergencyContact {
  name: string;
  phoneNumber: string;
  relationship: string;
}

interface OnboardingContactsProps {
  language: 'en' | 'sw';
  contacts: EmergencyContact[];
  onNext: (contacts: EmergencyContact[]) => void;
  onBack: () => void;
}

const relationships = {
  en: ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Neighbor', 'Other'],
  sw: ['Mwenzi', 'Mzazi', 'Mtoto', 'Ndugu', 'Rafiki', 'Jirani', 'Nyingine'],
};

const OnboardingContacts = ({ language, contacts: initialContacts, onNext, onBack }: OnboardingContactsProps) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>(
    initialContacts.length > 0 ? initialContacts : [{ name: '', phoneNumber: '', relationship: '' }]
  );
  const [errors, setErrors] = useState<string[]>([]);

  const addContact = () => {
    if (contacts.length < 5) {
      setContacts([...contacts, { name: '', phoneNumber: '', relationship: '' }]);
    }
  };

  const removeContact = (index: number) => {
    if (contacts.length > 1) {
      setContacts(contacts.filter((_, i) => i !== index));
    }
  };

  const updateContact = (index: number, field: keyof EmergencyContact, value: string) => {
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    setContacts(updated);
  };

  const validate = (): boolean => {
    const newErrors: string[] = [];
    
    // Filter out empty contacts
    const filledContacts = contacts.filter(c => c.name.trim() || c.phoneNumber.trim());
    
    if (filledContacts.length === 0) {
      newErrors.push(
        language === 'en' 
          ? 'Please add at least one emergency contact'
          : 'Tafadhali ongeza angalau mtu mmoja wa kuwasiliana naye wakati wa dharura'
      );
    }
    
    filledContacts.forEach((contact, index) => {
      if (!contact.name.trim()) {
        newErrors.push(
          language === 'en' 
            ? `Contact ${index + 1}: Name is required`
            : `Mtu ${index + 1}: Jina linahitajika`
        );
      }
      if (!contact.phoneNumber.trim()) {
        newErrors.push(
          language === 'en' 
            ? `Contact ${index + 1}: Phone number is required`
            : `Mtu ${index + 1}: Nambari ya simu inahitajika`
        );
      } else if (!/^[+]?[\d\s-]{10,15}$/.test(contact.phoneNumber.replace(/\s/g, ''))) {
        newErrors.push(
          language === 'en' 
            ? `Contact ${index + 1}: Invalid phone number`
            : `Mtu ${index + 1}: Nambari ya simu si sahihi`
        );
      }
    });
    
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      const filledContacts = contacts.filter(c => c.name.trim() && c.phoneNumber.trim());
      onNext(filledContacts);
    }
  };

  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          {language === 'en' ? 'Emergency Contacts' : 'Mawasiliano ya Dharura'}
        </h2>
        <p className="text-muted-foreground mt-1">
          {language === 'en' 
            ? 'These people will be notified during emergencies'
            : 'Watu hawa wataarifu wakati wa dharura'}
        </p>
      </div>

      {errors.length > 0 && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          <ul className="list-disc list-inside space-y-1">
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        {contacts.map((contact, index) => (
          <Card key={index}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    {language === 'en' ? `Contact ${index + 1}` : `Mtu ${index + 1}`}
                  </span>
                </div>
                {contacts.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeContact(index)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              <div className="grid gap-3">
                <div>
                  <Label htmlFor={`name-${index}`} className="text-xs">
                    {language === 'en' ? 'Name' : 'Jina'}
                  </Label>
                  <Input
                    id={`name-${index}`}
                    value={contact.name}
                    onChange={(e) => updateContact(index, 'name', e.target.value)}
                    placeholder={language === 'en' ? 'Full name' : 'Jina kamili'}
                  />
                </div>
                
                <div>
                  <Label htmlFor={`phone-${index}`} className="text-xs">
                    {language === 'en' ? 'Phone Number' : 'Nambari ya Simu'}
                  </Label>
                  <Input
                    id={`phone-${index}`}
                    type="tel"
                    value={contact.phoneNumber}
                    onChange={(e) => updateContact(index, 'phoneNumber', e.target.value)}
                    placeholder="+254 700 000 000"
                  />
                </div>
                
                <div>
                  <Label htmlFor={`relationship-${index}`} className="text-xs">
                    {language === 'en' ? 'Relationship' : 'Uhusiano'}
                  </Label>
                  <Select
                    value={contact.relationship}
                    onValueChange={(value) => updateContact(index, 'relationship', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={language === 'en' ? 'Select...' : 'Chagua...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {relationships[language].map((rel, i) => (
                        <SelectItem key={i} value={relationships.en[i].toLowerCase()}>
                          {rel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {contacts.length < 5 && (
          <Button variant="outline" onClick={addContact} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            {language === 'en' ? 'Add Another Contact' : 'Ongeza Mtu Mwingine'}
          </Button>
        )}
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

export default OnboardingContacts;
