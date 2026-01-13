import { Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { t, Language } from '@/lib/translations';

interface HeroProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  isAuthenticated: boolean;
  onGetStarted: () => void;
}

const Hero = ({ language, onLanguageChange, isAuthenticated, onGetStarted }: HeroProps) => {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyem0wLTRIMjR2LTJoMTJ2MnptMC04SDI0di0yaDEydjJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
      
      <div className="relative px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Stethoscope className="h-6 w-6" />
            </div>
            <span className="font-bold text-lg">{t('appName', language)}</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="text-primary-foreground hover:bg-white/20" />
            <LanguageToggle 
              language={language} 
              onToggle={onLanguageChange}
              className="bg-white/20"
            />
          </div>
        </div>

        {/* Hero content */}
        <div className="text-center py-8">
          <h1 className="text-3xl font-bold mb-3 leading-tight">
            {language === 'en' 
              ? 'Your AI-Powered Health Companion' 
              : 'Mwenzako wa Afya Anayeendeshwa na AI'}
          </h1>
          <p className="text-primary-foreground/80 text-sm mb-6 max-w-xs mx-auto leading-relaxed">
            {language === 'en'
              ? 'Get instant first aid guidance, find nearby hospitals, and connect with health workers - all in one app.'
              : 'Pata mwongozo wa haraka wa huduma ya kwanza, tafuta hospitali za karibu, na wasiliana na wafanyakazi wa afya - yote katika programu moja.'}
          </p>
          
          {!isAuthenticated && (
            <Button
              size="lg"
              variant="secondary"
              onClick={onGetStarted}
              className="font-semibold px-8"
            >
              {language === 'en' ? 'Get Started Free' : 'Anza Bure'}
            </Button>
          )}
        </div>
      </div>

      {/* Wave decoration */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-12">
          <path
            d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z"
            className="fill-background"
          />
        </svg>
      </div>
    </div>
  );
};

export default Hero;
