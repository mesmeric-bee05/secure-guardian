import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import ProfileHeader from '@/components/profile/ProfileHeader';
import ProfileForm from '@/components/profile/ProfileForm';
import EmergencyContactsList from '@/components/profile/EmergencyContactsList';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Language } from '@/lib/translations';
import { ProfileFormData } from '@/lib/validations';
import { toast } from 'sonner';

interface EmergencyContact {
  id: string;
  name: string;
  phone_number: string;
  relationship: string | null;
  is_primary: boolean | null;
}

const Profile = () => {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, signOut, updateProfile } = useAuth();
  const [language, setLanguage] = useState<Language>(
    (profile?.preferred_language as Language) || 'en'
  );
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);

  // Fetch emergency contacts
  useEffect(() => {
    const fetchContacts = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('emergency_contacts')
          .select('*')
          .eq('user_id', user.id)
          .order('is_primary', { ascending: false });

        if (error) throw error;
        setContacts(data || []);
      } catch (error) {
        console.error('Error fetching contacts:', error);
      } finally {
        setLoadingContacts(false);
      }
    };

    fetchContacts();
  }, [user]);

  // Update language when profile loads
  useEffect(() => {
    if (profile?.preferred_language) {
      setLanguage(profile.preferred_language as Language);
    }
  }, [profile?.preferred_language]);

  const handleLanguageChange = async (lang: Language) => {
    setLanguage(lang);
    if (user) {
      await updateProfile({ preferred_language: lang });
    }
  };

  const handleSaveProfile = async (data: ProfileFormData) => {
    await updateProfile({
      full_name: data.fullName,
      phone_number: data.phoneNumber || null,
      blood_type: data.bloodType || null,
      allergies: data.allergies ? data.allergies.split(',').map(s => s.trim()) : null,
      medical_conditions: data.medicalConditions ? data.medicalConditions.split(',').map(s => s.trim()) : null,
      date_of_birth: data.dateOfBirth || null,
      preferred_language: language,
    });
  };

  const handleAddContact = async (contact: Omit<EmergencyContact, 'id'>) => {
    if (!user) return;

    const { data, error } = await supabase
      .from('emergency_contacts')
      .insert({
        user_id: user.id,
        name: contact.name,
        phone_number: contact.phone_number,
        relationship: contact.relationship,
        is_primary: contact.is_primary,
      })
      .select()
      .single();

    if (error) throw error;
    setContacts(prev => [...prev, data]);
  };

  const handleDeleteContact = async (id: string) => {
    const { error } = await supabase
      .from('emergency_contacts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const initialFormData: Partial<ProfileFormData> = {
    fullName: profile?.full_name || '',
    phoneNumber: profile?.phone_number || '',
    bloodType: (profile?.blood_type as ProfileFormData['bloodType']) || '',
    allergies: profile?.allergies?.join(', ') || '',
    medicalConditions: profile?.medical_conditions?.join(', ') || '',
    dateOfBirth: profile?.date_of_birth || '',
  };

  return (
    <div className="min-h-screen bg-background">
      <ProfileHeader
        fullName={profile?.full_name || user?.email || ''}
        language={language}
        onLogout={handleLogout}
      />
      
      <div className="relative -mt-8">
        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="px-4 pb-8 space-y-4">
            <ProfileForm
              initialData={initialFormData}
              language={language}
              onLanguageChange={handleLanguageChange}
              onSave={handleSaveProfile}
            />
            
            {loadingContacts ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <EmergencyContactsList
                contacts={contacts}
                language={language}
                onAdd={handleAddContact}
                onDelete={handleDeleteContact}
              />
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default Profile;
