import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import OnboardingProgress from '@/components/onboarding/OnboardingProgress';
import OnboardingWelcome from '@/components/onboarding/OnboardingWelcome';
import OnboardingProfile from '@/components/onboarding/OnboardingProfile';
import OnboardingMedical from '@/components/onboarding/OnboardingMedical';
import OnboardingContacts from '@/components/onboarding/OnboardingContacts';
import OnboardingLocation from '@/components/onboarding/OnboardingLocation';
import OnboardingNotifications from '@/components/onboarding/OnboardingNotifications';

interface ProfileData {
  fullName: string;
  phoneNumber: string;
  preferredLanguage: 'en' | 'sw';
  dateOfBirth: string;
}

interface MedicalData {
  bloodType: string;
  allergies: string;
  medicalConditions: string;
}

interface EmergencyContact {
  name: string;
  phoneNumber: string;
  relationship: string;
}

const TOTAL_STEPS = 6;

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState<'en' | 'sw'>('en');

  // Form data
  const [profileData, setProfileData] = useState<ProfileData>({
    fullName: '',
    phoneNumber: '',
    preferredLanguage: 'en',
    dateOfBirth: '',
  });
  const [medicalData, setMedicalData] = useState<MedicalData>({
    bloodType: '',
    allergies: '',
    medicalConditions: '',
  });
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);

  // Initialize form data from profile
  useEffect(() => {
    if (profile) {
      setProfileData({
        fullName: profile.full_name || '',
        phoneNumber: profile.phone_number || '',
        preferredLanguage: (profile.preferred_language as 'en' | 'sw') || 'en',
        dateOfBirth: profile.date_of_birth || '',
      });
      setMedicalData({
        bloodType: profile.blood_type || '',
        allergies: profile.allergies?.join(', ') || '',
        medicalConditions: profile.medical_conditions?.join(', ') || '',
      });
      setLanguage((profile.preferred_language as 'en' | 'sw') || 'en');
    }
  }, [profile]);

  // Redirect if already completed
  useEffect(() => {
    if (!authLoading && profile) {
      // Check if onboarding is completed using type assertion
      const profileWithOnboarding = profile as { onboarding_completed?: boolean };
      if (profileWithOnboarding.onboarding_completed) {
        navigate('/');
      }
    }
  }, [authLoading, profile, navigate]);

  const handleProfileNext = (data: ProfileData) => {
    setProfileData(data);
    setLanguage(data.preferredLanguage);
    setCurrentStep(3);
  };

  const handleMedicalNext = (data: MedicalData) => {
    setMedicalData(data);
    setCurrentStep(4);
  };

  const handleContactsNext = async (contactsList: EmergencyContact[]) => {
    setContacts(contactsList);
    setCurrentStep(5);
  };

  const handleLocationNext = () => {
    setCurrentStep(6);
  };

  const handleComplete = async () => {
    if (!user) return;

    setSaving(true);
    try {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: profileData.fullName,
          phone_number: profileData.phoneNumber || null,
          preferred_language: profileData.preferredLanguage,
          date_of_birth: profileData.dateOfBirth || null,
          blood_type: medicalData.bloodType || null,
          allergies: medicalData.allergies ? medicalData.allergies.split(',').map(s => s.trim()).filter(Boolean) : null,
          medical_conditions: medicalData.medicalConditions ? medicalData.medicalConditions.split(',').map(s => s.trim()).filter(Boolean) : null,
          onboarding_completed: true,
        })
        .eq('user_id', user.id);

      if (profileError) throw profileError;

      // Save emergency contacts
      if (contacts.length > 0) {
        // First delete existing contacts
        await supabase
          .from('emergency_contacts')
          .delete()
          .eq('user_id', user.id);

        // Insert new contacts
        const { error: contactsError } = await supabase
          .from('emergency_contacts')
          .insert(
            contacts.map((contact, index) => ({
              user_id: user.id,
              name: contact.name,
              phone_number: contact.phoneNumber,
              relationship: contact.relationship || null,
              is_primary: index === 0,
            }))
          );

        if (contactsError) throw contactsError;
      }

      toast.success(
        language === 'en' 
          ? 'Setup complete! Welcome to MediReach+' 
          : 'Mipangilio imekamilika! Karibu MediReach+'
      );
      
      navigate('/');
    } catch (error) {
      console.error('Error saving onboarding data:', error);
      toast.error(
        language === 'en' 
          ? 'Failed to save. Please try again.' 
          : 'Imeshindikana kuhifadhi. Tafadhali jaribu tena.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="p-6">
          <OnboardingProgress 
            currentStep={currentStep} 
            totalSteps={TOTAL_STEPS} 
            language={language}
          />

          <div className="mt-6">
            {currentStep === 1 && (
              <OnboardingWelcome
                language={language}
                onNext={() => setCurrentStep(2)}
              />
            )}

            {currentStep === 2 && (
              <OnboardingProfile
                language={language}
                initialData={profileData}
                onNext={handleProfileNext}
                onBack={() => setCurrentStep(1)}
              />
            )}

            {currentStep === 3 && (
              <OnboardingMedical
                language={language}
                initialData={medicalData}
                onNext={handleMedicalNext}
                onBack={() => setCurrentStep(2)}
                onSkip={() => setCurrentStep(4)}
              />
            )}

            {currentStep === 4 && (
              <OnboardingContacts
                language={language}
                contacts={contacts}
                onNext={handleContactsNext}
                onBack={() => setCurrentStep(3)}
              />
            )}

            {currentStep === 5 && (
              <OnboardingLocation
                language={language}
                onNext={handleLocationNext}
                onBack={() => setCurrentStep(4)}
              />
            )}

            {currentStep === 6 && (
              <OnboardingNotifications
                language={language}
                onComplete={handleComplete}
                onBack={() => setCurrentStep(5)}
              />
            )}
          </div>

          {saving && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;
