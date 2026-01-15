import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Hero from '@/components/home/Hero';
import QuickActions from '@/components/home/QuickActions';
import FeatureCards from '@/components/home/FeatureCards';
import FirstAidProtocols from '@/components/home/FirstAidProtocols';
import { useAuth } from '@/hooks/useAuth';
import { Language } from '@/lib/translations';

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, isChw, isAdmin, loading } = useAuth();
  const [language, setLanguage] = useState<Language>('en');

  const isAuthenticated = !!user;

  // Update language when profile loads
  useEffect(() => {
    if (profile?.preferred_language) {
      setLanguage(profile.preferred_language as Language);
    }
  }, [profile?.preferred_language]);

  const handleGetStarted = () => {
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      <Hero
        language={language}
        onLanguageChange={setLanguage}
        isAuthenticated={isAuthenticated}
        onGetStarted={handleGetStarted}
      />
      
      <QuickActions
        language={language}
        isAuthenticated={isAuthenticated}
        isChw={isChw()}
        isAdmin={isAdmin()}
      />

      <FirstAidProtocols language={language} />
      
      <FeatureCards language={language} />
      
      {/* Footer */}
      <div className="px-4 py-6 text-center">
        <p className="text-xs text-muted-foreground">
          {language === 'en' 
            ? 'MediReach+ is not a substitute for professional medical advice. For emergencies, call 999.'
            : 'MediReach+ sio mbadala wa ushauri wa kitaalamu wa kimatibabu. Kwa dharura, piga 999.'}
        </p>
      </div>
    </div>
  );
};

export default Index;
