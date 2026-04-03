import { useState } from 'react';
import { Heart, Flame, Wind, Bone, Pill, AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProtocols } from '@/hooks/useProtocols';
import { Language } from '@/lib/translations';
import ProtocolDetailModal from './ProtocolDetailModal';

interface FirstAidProtocolsProps {
  language: Language;
}

const categoryIcons: Record<string, React.ReactNode> = {
  cardiac: <Heart className="h-6 w-6" />,
  burns: <Flame className="h-6 w-6" />,
  breathing: <Wind className="h-6 w-6" />,
  trauma: <Bone className="h-6 w-6" />,
  poisoning: <Pill className="h-6 w-6" />,
  default: <AlertTriangle className="h-6 w-6" />,
};

const categoryColors: Record<string, string> = {
  cardiac: 'bg-red-500/10 text-red-500 border-red-500/20',
  burns: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  breathing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  trauma: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  poisoning: 'bg-green-500/10 text-green-500 border-green-500/20',
  default: 'bg-muted text-muted-foreground border-muted',
};

const translations = {
  en: {
    title: 'First Aid Protocols',
    subtitle: 'Quick access to emergency procedures',
    viewDetails: 'View Details',
    loading: 'Loading protocols...',
    noProtocols: 'No protocols available',
    error: 'Failed to load protocols',
  },
  sw: {
    title: 'Itifaki za Huduma ya Kwanza',
    subtitle: 'Upatikanaji wa haraka wa taratibu za dharura',
    viewDetails: 'Tazama Maelezo',
    loading: 'Inapakia itifaki...',
    noProtocols: 'Hakuna itifaki zinazopatikana',
    error: 'Imeshindwa kupakia itifaki',
  },
};

const FirstAidProtocols = ({ language }: FirstAidProtocolsProps) => {
  const { protocols, isLoading, error, getTitle, getContent, getSteps } = useProtocols(language);
  const [selectedProtocol, setSelectedProtocol] = useState<typeof protocols[0] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const t = translations[language];

  const getIcon = (category: string) => 
    categoryIcons[category.toLowerCase()] || categoryIcons.default;

  const getColor = (category: string) => 
    categoryColors[category.toLowerCase()] || categoryColors.default;

  if (isLoading) {
    return (
      <section className="px-4 py-8">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-foreground">{t.title}</h2>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="px-4 py-8">
        <div className="text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p>{t.error}</p>
        </div>
      </section>
    );
  }

  if (protocols.length === 0) {
    return (
      <section className="px-4 py-8">
        <div className="text-center text-muted-foreground">
          <p>{t.noProtocols}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-8">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-foreground">{t.title}</h2>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {protocols.slice(0, 6).map((protocol) => (
          <Card
            key={protocol.id}
            className={`cursor-pointer transition-all hover:scale-[1.02] border ${getColor(protocol.category)}`}
            onClick={() => setSelectedProtocol(protocol)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${getColor(protocol.category)}`}>
                  {getIcon(protocol.category)}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-sm font-medium line-clamp-2">
                {getTitle(protocol)}
              </CardTitle>
              {protocol.severity && (
                <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${
                  protocol.severity === 'critical' 
                    ? 'bg-destructive/10 text-destructive' 
                    : protocol.severity === 'high'
                    ? 'bg-orange-500/10 text-orange-500'
                    : 'bg-yellow-500/10 text-yellow-600'
                }`}>
                  {protocol.severity}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {protocols.length > 6 && (
        <div className="mt-4 text-center">
          <Button variant="outline" size="sm">
            {language === 'en' ? 'View All Protocols' : 'Tazama Itifaki Zote'}
          </Button>
        </div>
      )}

      <ProtocolDetailModal
        protocol={selectedProtocol}
        language={language}
        onClose={() => setSelectedProtocol(null)}
        getTitle={getTitle}
        getContent={getContent}
        getSteps={getSteps}
      />
    </section>
  );
};

export default FirstAidProtocols;
