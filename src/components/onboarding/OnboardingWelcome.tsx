import { Heart, MessageSquare, Bell, WifiOff, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface OnboardingWelcomeProps {
  language: 'en' | 'sw';
  onNext: () => void;
}

const features = {
  en: [
    { icon: MessageSquare, title: 'AI Health Chat', description: 'Get instant health guidance from our AI assistant' },
    { icon: Bell, title: 'Emergency Alerts', description: 'Send alerts to contacts and nearby health workers' },
    { icon: WifiOff, title: 'Works Offline', description: 'Access critical features even without internet' },
    { icon: Shield, title: 'Secure & Private', description: 'Your health data is encrypted and protected' },
  ],
  sw: [
    { icon: MessageSquare, title: 'Mazungumzo ya AI', description: 'Pata mwongozo wa afya kutoka kwa msaidizi wetu wa AI' },
    { icon: Bell, title: 'Tahadhari za Dharura', description: 'Tuma tahadhari kwa mawasiliano na wafanyakazi wa afya' },
    { icon: WifiOff, title: 'Inafanya Kazi Nje ya Mtandao', description: 'Fikia huduma muhimu hata bila intaneti' },
    { icon: Shield, title: 'Salama na Faragha', description: 'Data yako ya afya inalindwa' },
  ],
};

const OnboardingWelcome = ({ language, onNext }: OnboardingWelcomeProps) => {
  const featureList = features[language];

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-4">
      <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center">
        <Heart className="h-10 w-10 text-primary-foreground" />
      </div>
      
      <div>
        <h1 className="text-2xl font-bold">
          {language === 'en' ? 'Welcome to MediReach+' : 'Karibu MediReach+'}
        </h1>
        <p className="text-muted-foreground mt-2">
          {language === 'en' 
            ? 'Your AI-powered health companion for rural Kenya'
            : 'Mwandamizi wako wa afya wa AI kwa Kenya vijijini'}
        </p>
      </div>

      <div className="grid gap-3 w-full max-w-md">
        {featureList.map((feature, index) => (
          <Card key={index} className="text-left">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <feature.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button onClick={onNext} size="lg" className="w-full max-w-md">
        {language === 'en' ? 'Get Started' : 'Anza'}
      </Button>
    </div>
  );
};

export default OnboardingWelcome;
