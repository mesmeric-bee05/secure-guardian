import { useState } from 'react';
import { Plus, Phone, Trash2, User, Star } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { t, Language } from '@/lib/translations';
import { toast } from 'sonner';

interface EmergencyContact {
  id: string;
  name: string;
  phone_number: string;
  relationship: string | null;
  is_primary: boolean | null;
}

interface EmergencyContactsListProps {
  contacts: EmergencyContact[];
  language: Language;
  onAdd: (contact: Omit<EmergencyContact, 'id'>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const relationships = [
  { en: 'Spouse', sw: 'Mke/Mume' },
  { en: 'Parent', sw: 'Mzazi' },
  { en: 'Sibling', sw: 'Ndugu' },
  { en: 'Child', sw: 'Mtoto' },
  { en: 'Friend', sw: 'Rafiki' },
  { en: 'Other', sw: 'Mwingine' },
];

const EmergencyContactsList = ({ contacts, language, onAdd, onDelete }: EmergencyContactsListProps) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    phone_number: '',
    relationship: '',
    is_primary: false,
  });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newContact.name.trim() || !newContact.phone_number.trim()) {
      toast.error(language === 'en' ? 'Name and phone are required' : 'Jina na simu zinahitajika');
      return;
    }

    setSaving(true);
    try {
      await onAdd({
        name: newContact.name,
        phone_number: newContact.phone_number,
        relationship: newContact.relationship || null,
        is_primary: newContact.is_primary,
      });
      toast.success(t('contactAdded', language));
      setShowAddDialog(false);
      setNewContact({ name: '', phone_number: '', relationship: '', is_primary: false });
    } catch (error) {
      toast.error(language === 'en' ? 'Failed to add contact' : 'Imeshindikana kuongeza mwasiliani');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
      toast.success(language === 'en' ? 'Contact deleted' : 'Mwasiliani amefutwa');
    } catch (error) {
      toast.error(language === 'en' ? 'Failed to delete contact' : 'Imeshindikana kufuta mwasiliani');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{t('emergencyContacts', language)}</CardTitle>
        <Button size="sm" onClick={() => setShowAddDialog(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t('addContact', language)}
        </Button>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {language === 'en' 
              ? 'No emergency contacts added yet. Add contacts who should be notified in emergencies.'
              : 'Hakuna mawasiliano ya dharura yaliyoongezwa bado. Ongeza mawasiliano ambao wanapaswa kuarifiwa wakati wa dharura.'}
          </p>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{contact.name}</span>
                    {contact.is_primary && (
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {contact.phone_number}
                  </p>
                  {contact.relationship && (
                    <p className="text-xs text-muted-foreground">{contact.relationship}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(contact.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('addContact', language)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="contact-name">{language === 'en' ? 'Name' : 'Jina'}</Label>
              <Input
                id="contact-name"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                placeholder={language === 'en' ? 'Contact name' : 'Jina la mwasiliani'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">{t('phoneNumber', language)}</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={newContact.phone_number}
                onChange={(e) => setNewContact({ ...newContact, phone_number: e.target.value })}
                placeholder="+254 7XX XXX XXX"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('relationship', language)}</Label>
              <Select
                value={newContact.relationship}
                onValueChange={(v) => setNewContact({ ...newContact, relationship: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={language === 'en' ? 'Select relationship' : 'Chagua uhusiano'} />
                </SelectTrigger>
                <SelectContent>
                  {relationships.map((rel) => (
                    <SelectItem key={rel.en} value={rel.en}>
                      {language === 'en' ? rel.en : rel.sw}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is-primary">{t('primaryContact', language)}</Label>
              <Switch
                id="is-primary"
                checked={newContact.is_primary}
                onCheckedChange={(checked) => setNewContact({ ...newContact, is_primary: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('cancel', language)}
            </Button>
            <Button onClick={handleAdd} disabled={saving}>
              {t('save', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default EmergencyContactsList;
