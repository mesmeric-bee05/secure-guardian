import { Mic, Globe, Clock, Bell } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Language } from '@/lib/translations';

interface FeatureCardsProps {
  language: Language;
}

const features = [
  {
    icon: Mic,
    titleEn: 'Voice Enabled',
    titleSw: 'Sauti Imewezeshwa',
    descEn: 'Speak your symptoms',
    descSw: 'Sema dalili zako',
  },
  {
    icon: Globe,
    titleEn: 'Bilingual',
    titleSw: 'Lugha Mbili',
    descEn: 'English & Swahili',
    descSw: 'Kiingereza na Kiswahili',
  },
  {
    icon: Clock,
    titleEn: '24/7 Available',
    titleSw: 'Masaa 24/7',
    descEn: 'Always here to help',
    descSw: 'Daima hapa kusaidia',
  },
  {
    icon: Bell,
    titleEn: 'SMS Alerts',
    titleSw: 'Arifa za SMS',
    descEn: 'Emergency notifications',
    descSw: 'Taarifa za dharura',
  },
];

const FeatureCards = ({ language }: FeatureCardsProps) => {
  return (
    <div className="px-4 py-6 bg-muted/50">
      <h2 className="text-lg font-semibold mb-4">
        {language === 'en' ? 'Features' : 'Vipengele'}
      </h2>
      
      <div className="grid grid-cols-2 gap-3">
        {features.map((feature, index) => (
          <Card key={index} className="bg-background">
            <CardContent className="p-4 text-center">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <feature.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm">
                {language === 'en' ? feature.titleEn : feature.titleSw}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {language === 'en' ? feature.descEn : feature.descSw}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
});

FeatureCards.displayName = 'FeatureCards';

export default FeatureCards;
