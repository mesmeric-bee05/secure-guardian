import { useState, useCallback, useRef, useEffect } from 'react';

interface VoiceOption {
  voice: SpeechSynthesisVoice;
  name: string;
  lang: string;
}

interface UseVoiceOptions {
  language?: 'en' | 'sw';
  continuous?: boolean;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
  }
}

export function useVoice(options: UseVoiceOptions = {}) {
  const { language = 'en', continuous = false, onResult, onError } = options;
  
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Load available voices
  const loadVoices = useCallback(() => {
    if (!synthRef.current) return;
    
    const voices = synthRef.current.getVoices();
    const langPrefix = language === 'sw' ? 'sw' : 'en';
    
    // Filter voices for the current language
    const filteredVoices: VoiceOption[] = voices
      .filter(voice => voice.lang.toLowerCase().startsWith(langPrefix))
      .map(voice => ({
        voice,
        name: voice.name,
        lang: voice.lang,
      }));

    // Also include some good fallback voices for Swahili (often not available natively)
    if (language === 'sw' && filteredVoices.length === 0) {
      // Use English voices as fallback for Swahili
      const englishVoices = voices
        .filter(voice => voice.lang.toLowerCase().startsWith('en'))
        .slice(0, 3)
        .map(voice => ({
          voice,
          name: `${voice.name} (Fallback)`,
          lang: voice.lang,
        }));
      filteredVoices.push(...englishVoices);
    }

    setAvailableVoices(filteredVoices);
    
    // Auto-select best voice for the language
    if (filteredVoices.length > 0 && !selectedVoice) {
      // Prefer female voices for medical/assistant contexts
      const femaleVoice = filteredVoices.find(v => 
        v.name.toLowerCase().includes('female') || 
        v.name.toLowerCase().includes('samantha') ||
        v.name.toLowerCase().includes('victoria') ||
        v.name.toLowerCase().includes('karen') ||
        v.name.toLowerCase().includes('moira')
      );
      
      setSelectedVoice(femaleVoice?.voice || filteredVoices[0].voice);
    }
  }, [language, selectedVoice]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition && !!window.speechSynthesis);
    
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = continuous;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = language === 'sw' ? 'sw-KE' : 'en-US';

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        const fullTranscript = finalTranscript || interimTranscript;
        setTranscript(fullTranscript);
        
        if (finalTranscript && onResult) {
          onResult(finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        onError?.(event.error);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    synthRef.current = window.speechSynthesis;
    
    // Load voices
    loadVoices();
    
    // Voices may load asynchronously
    if (synthRef.current) {
      synthRef.current.onvoiceschanged = loadVoices;
    }

    return () => {
      recognitionRef.current?.abort();
      synthRef.current?.cancel();
    };
  }, [language, continuous, onResult, onError, loadVoices]);

  // Update recognition language when language changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language === 'sw' ? 'sw-KE' : 'en-US';
    }
    loadVoices();
  }, [language, loadVoices]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      onError?.('Speech recognition not supported');
      return;
    }

    setTranscript('');
    setIsListening(true);
    
    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      setIsListening(false);
    }
  }, [onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synthRef.current) {
      onError?.('Speech synthesis not supported');
      return;
    }

    // Cancel any ongoing speech
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Use selected voice or default
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    utterance.lang = language === 'sw' ? 'sw-KE' : 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      onEnd?.();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      onError?.('Speech synthesis error');
    };

    synthRef.current.speak(utterance);
  }, [language, selectedVoice, onError]);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  const selectVoice = useCallback((voiceName: string) => {
    const voice = availableVoices.find(v => v.name === voiceName);
    if (voice) {
      setSelectedVoice(voice.voice);
    }
  }, [availableVoices]);

  return {
    isSupported,
    isListening,
    isSpeaking,
    transcript,
    availableVoices,
    selectedVoice: selectedVoice ? {
      name: selectedVoice.name,
      lang: selectedVoice.lang,
    } : null,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    selectVoice,
  };
}
