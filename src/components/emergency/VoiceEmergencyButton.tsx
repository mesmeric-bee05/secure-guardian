import { useState, useCallback } from 'react';
import { Mic, MicOff, AlertTriangle, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useVoiceEmergency } from '@/hooks/useVoiceEmergency';
import { Language } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface VoiceEmergencyButtonProps {
  language: Language;
  onEmergencyDetected: (symptoms: string, priority: string) => void;
  className?: string;
}

const priorityColors = {
  low: 'bg-green-500/10 text-green-600 border-green-500/30',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  high: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  critical: 'bg-red-500/10 text-red-600 border-red-500/30 animate-pulse',
};

const priorityLabels = {
  en: { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' },
  sw: { low: 'Chini', medium: 'Wastani', high: 'Juu', critical: 'Muhimu' },
};

export default function VoiceEmergencyButton({
  language,
  onEmergencyDetected,
  className,
}: VoiceEmergencyButtonProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const {
    isSupported,
    isListening,
    isSpeaking,
    transcript,
    detectedPriority,
    detectedSymptoms,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    reset,
  } = useVoiceEmergency({
    language,
    onError: (error) => console.error('Voice error:', error),
  });

  const handleStartListening = useCallback(() => {
    setShowPanel(true);
    setIsConfirming(false);
    startListening();
  }, [startListening]);

  const handleStopListening = useCallback(() => {
    stopListening();
    if (transcript.trim()) {
      setIsConfirming(true);
    }
  }, [stopListening, transcript]);

  const handleConfirm = useCallback(() => {
    onEmergencyDetected(detectedSymptoms || transcript, detectedPriority);
    reset();
    setShowPanel(false);
    setIsConfirming(false);
  }, [onEmergencyDetected, detectedSymptoms, transcript, detectedPriority, reset]);

  const handleCancel = useCallback(() => {
    reset();
    setShowPanel(false);
    setIsConfirming(false);
    stopSpeaking();
  }, [reset, stopSpeaking]);

  const handleReadBack = useCallback(() => {
    const message = language === 'en'
      ? `Detected symptoms: ${detectedSymptoms}. Priority level: ${detectedPriority}.`
      : `Dalili zilizotambuliwa: ${detectedSymptoms}. Kiwango cha kipaumbele: ${priorityLabels.sw[detectedPriority as keyof typeof priorityLabels.sw]}.`;
    speak(message);
  }, [language, detectedSymptoms, detectedPriority, speak]);

  if (!isSupported) {
    return (
      <Button variant="outline" disabled className={className}>
        <MicOff className="h-4 w-4 mr-2" />
        {language === 'en' ? 'Voice not supported' : 'Sauti haitegemezwi'}
      </Button>
    );
  }

  if (!showPanel) {
    return (
      <Button
        variant="outline"
        onClick={handleStartListening}
        className={cn(
          'border-destructive/50 text-destructive hover:bg-destructive/10',
          className
        )}
      >
        <Mic className="h-4 w-4 mr-2" />
        {language === 'en' ? 'Voice Emergency' : 'Dharura ya Sauti'}
      </Button>
    );
  }

  return (
    <Card className={cn('border-destructive/30', className)}>
      <CardContent className="pt-4 space-y-4">
        {/* Listening indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isListening ? (
              <>
                <div className="relative">
                  <Mic className="h-5 w-5 text-destructive" />
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full animate-ping" />
                </div>
                <span className="text-sm font-medium text-destructive">
                  {language === 'en' ? 'Listening...' : 'Inasikiliza...'}
                </span>
              </>
            ) : (
              <>
                <MicOff className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {language === 'en' ? 'Paused' : 'Imesimamishwa'}
                </span>
              </>
            )}
          </div>

          {detectedPriority && (
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                priorityColors[detectedPriority as keyof typeof priorityColors]
              )}
            >
              {priorityLabels[language][detectedPriority as keyof typeof priorityLabels.en]}
            </Badge>
          )}
        </div>

        {/* Transcript display */}
        <div className="min-h-[80px] p-3 bg-muted/50 rounded-lg">
          {transcript ? (
            <p className="text-sm">{transcript}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {language === 'en'
                ? 'Speak your symptoms or emergency...'
                : 'Sema dalili zako au dharura yako...'}
            </p>
          )}
        </div>

        {/* Detected symptoms */}
        {detectedSymptoms && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-600">
                  {language === 'en' ? 'Detected Emergency:' : 'Dharura Iliyotambuliwa:'}
                </p>
                <p className="text-sm">{detectedSymptoms}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        {!isConfirming ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="flex-1"
            >
              {language === 'en' ? 'Cancel' : 'Ghairi'}
            </Button>
            {isListening ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopListening}
                className="flex-1"
              >
                <MicOff className="h-4 w-4 mr-2" />
                {language === 'en' ? 'Stop' : 'Simama'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStartListening}
                className="flex-1"
              >
                <Mic className="h-4 w-4 mr-2" />
                {language === 'en' ? 'Continue' : 'Endelea'}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
            >
              {language === 'en' ? 'Cancel' : 'Ghairi'}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={isSpeaking ? stopSpeaking : handleReadBack}
            >
              {isSpeaking ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirm}
              className="flex-1"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              {language === 'en' ? 'Send Alert' : 'Tuma Tahadhari'}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
