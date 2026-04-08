import { useState } from 'react';
import { X, Volume2, VolumeX, AlertTriangle, Phone, CheckCircle, Play, BookOpen, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Language } from '@/lib/translations';
import ProtocolVideoResource from './ProtocolVideoResource';

interface ReferenceBook {
  title: string;
  author: string;
  url: string;
  isbn?: string;
}

interface Protocol {
  id: string;
  category: string;
  title_en: string;
  title_sw: string;
  content_en: string;
  content_sw: string;
  steps: { en: string[]; sw: string[] };
  red_flags: string[] | null;
  seek_help_when: string[] | null;
  severity: string | null;
  video_url?: string | null;
  reference_books?: ReferenceBook[] | null;
}

interface ProtocolDetailModalProps {
  protocol: Protocol | null;
  language: Language;
  onClose: () => void;
  getTitle: (protocol: Protocol) => string;
  getContent: (protocol: Protocol) => string;
  getSteps: (protocol: Protocol) => string[];
}

const translations = {
  en: {
    steps: 'Steps to Follow',
    redFlags: 'Red Flags - Seek Help Immediately If:',
    seekHelp: 'When to Go to Hospital',
    callEmergency: 'Call Emergency (999)',
    disclaimer: 'This is first aid guidance only. For medical emergencies, call 999 or visit the nearest hospital.',
    speak: 'Read Aloud',
    stopSpeaking: 'Stop Reading',
    videoDemo: 'Video Demonstration',
    watchVideo: 'Watch Demo',
    videoHelper: 'Trusted external training resource',
    videoFallback: 'Open the trusted training guide in a new tab.',
    referenceBooks: 'Recommended Reading',
    viewBook: 'View Book',
  },
  sw: {
    steps: 'Hatua za Kufuata',
    redFlags: 'Dalili za Hatari - Tafuta Msaada Mara Moja Ikiwa:',
    seekHelp: 'Wakati wa Kwenda Hospitali',
    callEmergency: 'Piga Simu ya Dharura (999)',
    disclaimer: 'Hii ni mwongozo wa huduma ya kwanza tu. Kwa dharura za kimatibabu, piga simu 999 au tembelea hospitali ya karibu.',
    speak: 'Soma Kwa Sauti',
    stopSpeaking: 'Acha Kusoma',
    videoDemo: 'Video ya Maonyesho',
    watchVideo: 'Tazama Video',
    videoHelper: 'Rasilimali salama ya mafunzo ya nje',
    videoFallback: 'Fungua mwongozo salama wa mafunzo kwenye kichupo kipya.',
    referenceBooks: 'Vitabu vya Kurejelea',
    viewBook: 'Tazama Kitabu',
  },
};

const ProtocolDetailModal = forwardRef<HTMLDivElement, ProtocolDetailModalProps>(({
  protocol,
  language,
  onClose,
  getTitle,
  getContent,
  getSteps,
}, ref) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const t = translations[language];

  const handleSpeak = () => {
    if (!protocol) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const steps = getSteps(protocol);
    const textToSpeak = [
      getTitle(protocol),
      getContent(protocol),
      t.steps,
      ...steps.map((step, i) => `${i + 1}. ${step}`),
      protocol.red_flags?.length ? t.redFlags : '',
      ...(protocol.red_flags || []),
    ].filter(Boolean).join('. ');

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = language === 'sw' ? 'sw-KE' : 'en-US';
    utterance.rate = 0.9;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const handleClose = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    onClose();
  };

  if (!protocol) return null;

  const steps = getSteps(protocol);
  const books: ReferenceBook[] = Array.isArray(protocol.reference_books) ? protocol.reference_books : [];

  return (
    <Dialog open={!!protocol} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0">
        <div className="p-4 pb-2 sticky top-0 bg-background z-10">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg pr-8">{getTitle(protocol)}</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="absolute right-4 top-4"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {protocol.severity && (
            <span className={`inline-block w-fit text-xs px-2 py-0.5 rounded-full mt-1 ${
              protocol.severity === 'critical'
                ? 'bg-destructive/10 text-destructive'
                : protocol.severity === 'high'
                ? 'bg-orange-500/10 text-orange-500'
                : 'bg-yellow-500/10 text-yellow-600'
            }`}>
              {protocol.severity.toUpperCase()}
            </span>
          )}
        </div>

        <ScrollArea className="max-h-[70vh] px-4">
          <p className="text-sm text-muted-foreground mb-4">{getContent(protocol)}</p>

          {/* Video Demo */}
          {protocol.video_url && (
            <div className="mb-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Play className="h-4 w-4 text-primary" />
                {t.videoDemo}
              </h3>
              <ProtocolVideoResource
                fallbackText={t.videoFallback}
                helperText={t.videoHelper}
                url={protocol.video_url}
                title={getTitle(protocol)}
                watchLabel={t.watchVideo}
              />
              <Separator className="my-4" />
            </div>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                {t.steps}
              </h3>
              <ol className="space-y-2">
                {steps.map((step, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </span>
                    <span className="text-sm text-foreground pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <Separator className="my-4" />

          {/* Red Flags */}
          {protocol.red_flags && protocol.red_flags.length > 0 && (
            <div className="mb-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <h3 className="font-semibold mb-2 flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {t.redFlags}
              </h3>
              <ul className="space-y-1">
                {protocol.red_flags.map((flag, index) => (
                  <li key={index} className="text-sm text-destructive flex gap-2">
                    <span>•</span>
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* When to Seek Help */}
          {protocol.seek_help_when && protocol.seek_help_when.length > 0 && (
            <div className="mb-4 p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
              <h3 className="font-semibold mb-2 flex items-center gap-2 text-orange-600">
                <Phone className="h-4 w-4" />
                {t.seekHelp}
              </h3>
              <ul className="space-y-1">
                {protocol.seek_help_when.map((item, index) => (
                  <li key={index} className="text-sm text-orange-600 flex gap-2">
                    <span>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reference Books */}
          {books.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                {t.referenceBooks}
              </h3>
              <div className="space-y-2">
                {books.map((book, index) => (
                  <a
                    key={index}
                    href={book.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors"
                  >
                    <BookOpen className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{book.title}</p>
                      <p className="text-xs text-muted-foreground">{book.author}</p>
                      {book.isbn && (
                        <p className="text-xs text-muted-foreground mt-0.5">ISBN: {book.isbn}</p>
                      )}
                    </div>
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="mb-4 p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">{t.disclaimer}</p>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="p-4 pt-2 border-t flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSpeak} className="flex-1">
            {isSpeaking ? (
              <><VolumeX className="h-4 w-4 mr-2" />{t.stopSpeaking}</>
            ) : (
              <><Volume2 className="h-4 w-4 mr-2" />{t.speak}</>
            )}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={() => {
              const num = '999';
              const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
              if (isMobile) {
                window.location.href = `tel:${num}`;
                return;
              }
              navigator.clipboard?.writeText(num).then(() => {
                toast.success(language === 'en' ? `Emergency number ${num} copied to clipboard` : `Nambari ya dharura ${num} imenakiliwa`);
              }).catch(() => {
                toast.info(language === 'en' ? `Call ${num} for emergency services` : `Piga ${num} kwa huduma za dharura`);
              });
              if (!navigator.clipboard) {
                toast.info(language === 'en' ? `Call ${num} for emergency services` : `Piga ${num} kwa huduma za dharura`);
              }
            }}
          >
            <Phone className="h-4 w-4 mr-2" />
            {t.callEmergency}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

ProtocolDetailModal.displayName = 'ProtocolDetailModal';

export default ProtocolDetailModal;
