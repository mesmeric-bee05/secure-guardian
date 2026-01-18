import { useState, useCallback, useRef, useEffect } from 'react';
import { Language } from '@/lib/translations';

interface VoiceEmergencyOptions {
  language?: Language;
  onSymptomDetected?: (symptoms: string) => void;
  onPriorityDetected?: (priority: string) => void;
  onTranscriptUpdate?: (transcript: string) => void;
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

// Emergency keywords for automatic detection
const emergencyKeywords = {
  en: {
    critical: ['dying', 'unconscious', 'not breathing', 'heart attack', 'stroke', 'seizure', 'severe bleeding', 'choking', 'drowning', 'can\'t breathe', 'cannot breathe'],
    high: ['emergency', 'help', 'urgent', 'blood', 'pain', 'accident', 'fall', 'broken', 'fracture', 'burn', 'injured', 'hurt badly', 'chest pain'],
    medium: ['sick', 'fever', 'vomiting', 'diarrhea', 'headache', 'dizzy', 'weak', 'tired', 'rash', 'cough'],
    low: ['minor', 'slight', 'small', 'little', 'mild'],
  },
  sw: {
    critical: ['anakufa', 'amezimia', 'hapumui', 'moyo', 'kiharusi', 'kifafa', 'damu nyingi', 'anasongwa', 'anazama', 'siwezi kupumua'],
    high: ['dharura', 'msaada', 'haraka', 'damu', 'maumivu', 'ajali', 'kuanguka', 'kuvunjika', 'kuungua', 'jeraha', 'maumivu ya kifua'],
    medium: ['mgonjwa', 'homa', 'kutapika', 'kuharisha', 'kichwa', 'kizunguzungu', 'dhaifu', 'uchovu', 'upele', 'kikohozi'],
    low: ['kidogo', 'ndogo', 'wastani'],
  },
};

// Symptom extraction patterns
const symptomPatterns = {
  en: [
    'i have', 'i am having', 'i feel', 'i\'m feeling', 'experiencing', 'suffering from',
    'my', 'there is', 'there\'s', 'got', 'i got', 'having',
  ],
  sw: [
    'nina', 'ninasikia', 'naona', 'nahisi', 'kuna', 'nimepata',
  ],
};

export function useVoiceEmergency(options: VoiceEmergencyOptions = {}) {
  const { 
    language = 'en', 
    onSymptomDetected, 
    onPriorityDetected, 
    onTranscriptUpdate,
    onError 
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [detectedPriority, setDetectedPriority] = useState<string>('medium');
  const [detectedSymptoms, setDetectedSymptoms] = useState('');
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const fullTranscriptRef = useRef('');

  // Detect priority from transcript
  const detectPriority = useCallback((text: string): string => {
    const lowerText = text.toLowerCase();
    const keywords = emergencyKeywords[language];

    // Check from most severe to least
    for (const keyword of keywords.critical) {
      if (lowerText.includes(keyword)) {
        return 'critical';
      }
    }
    for (const keyword of keywords.high) {
      if (lowerText.includes(keyword)) {
        return 'high';
      }
    }
    for (const keyword of keywords.medium) {
      if (lowerText.includes(keyword)) {
        return 'medium';
      }
    }
    for (const keyword of keywords.low) {
      if (lowerText.includes(keyword)) {
        return 'low';
      }
    }

    return 'medium'; // Default priority
  }, [language]);

  // Extract symptoms from transcript
  const extractSymptoms = useCallback((text: string): string => {
    let symptoms = text.trim();
    const patterns = symptomPatterns[language];

    // Clean up the transcript to get key symptoms
    for (const pattern of patterns) {
      const regex = new RegExp(`^${pattern}\\s+`, 'i');
      symptoms = symptoms.replace(regex, '');
    }

    // Capitalize first letter
    if (symptoms.length > 0) {
      symptoms = symptoms.charAt(0).toUpperCase() + symptoms.slice(1);
    }

    return symptoms;
  }, [language]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition && !!window.speechSynthesis);

    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = language === 'sw' ? 'sw-KE' : 'en-US';

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript + ' ';
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        if (finalTranscript) {
          fullTranscriptRef.current += finalTranscript;
        }

        const currentTranscript = fullTranscriptRef.current + interimTranscript;
        setTranscript(currentTranscript);
        onTranscriptUpdate?.(currentTranscript);

        // Detect priority and symptoms
        if (finalTranscript || interimTranscript) {
          const priority = detectPriority(currentTranscript);
          setDetectedPriority(priority);
          onPriorityDetected?.(priority);

          const symptoms = extractSymptoms(currentTranscript);
          setDetectedSymptoms(symptoms);
          onSymptomDetected?.(symptoms);
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

    return () => {
      recognitionRef.current?.abort();
      synthRef.current?.cancel();
    };
  }, [language, detectPriority, extractSymptoms, onError, onPriorityDetected, onSymptomDetected, onTranscriptUpdate]);

  // Update recognition language when language changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language === 'sw' ? 'sw-KE' : 'en-US';
    }
  }, [language]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      onError?.(language === 'en' ? 'Speech recognition not supported' : 'Utambuzi wa hotuba hausaidiwi');
      return;
    }

    // Reset state
    fullTranscriptRef.current = '';
    setTranscript('');
    setDetectedSymptoms('');
    setDetectedPriority('medium');
    setIsListening(true);

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      setIsListening(false);
    }
  }, [language, onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synthRef.current) {
      onError?.(language === 'en' ? 'Speech synthesis not supported' : 'Usanisi wa hotuba hausaidiwi');
      return;
    }

    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
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
      onError?.(language === 'en' ? 'Speech synthesis error' : 'Hitilafu ya usanisi wa hotuba');
    };

    synthRef.current.speak(utterance);
  }, [language, onError]);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  const confirmAlert = useCallback((onConfirm: () => void) => {
    const confirmMessage = language === 'en'
      ? `You said: ${detectedSymptoms}. Priority is ${detectedPriority}. Say yes to confirm or no to cancel.`
      : `Umesema: ${detectedSymptoms}. Kipaumbele ni ${detectedPriority}. Sema ndiyo kuthibitisha au hapana kughairi.`;

    speak(confirmMessage, () => {
      // After speaking, listen for confirmation
      if (recognitionRef.current) {
        const confirmRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const confirmInstance = new confirmRecognition();
        confirmInstance.lang = language === 'sw' ? 'sw-KE' : 'en-US';
        confirmInstance.onresult = (event: SpeechRecognitionEvent) => {
          const response = event.results[0][0].transcript.toLowerCase();
          if (response.includes('yes') || response.includes('ndiyo') || response.includes('confirm') || response.includes('thibitisha')) {
            onConfirm();
          } else {
            speak(language === 'en' ? 'Alert cancelled.' : 'Tahadhari imeghairiwa.');
          }
        };
        confirmInstance.start();
      }
    });
  }, [language, detectedSymptoms, detectedPriority, speak]);

  const reset = useCallback(() => {
    fullTranscriptRef.current = '';
    setTranscript('');
    setDetectedSymptoms('');
    setDetectedPriority('medium');
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  return {
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
    confirmAlert,
    reset,
  };
}
