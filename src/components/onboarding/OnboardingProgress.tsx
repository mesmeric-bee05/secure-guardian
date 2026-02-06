import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
  language: 'en' | 'sw';
}

const stepLabels = {
  en: ['Welcome', 'Profile', 'Medical', 'Contacts', 'Location', 'Notifications'],
  sw: ['Karibu', 'Wasifu', 'Afya', 'Mawasiliano', 'Mahali', 'Arifa'],
};

const OnboardingProgress = ({ currentStep, totalSteps, language }: OnboardingProgressProps) => {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between mb-2">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          
          return (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                    isCompleted && 'bg-primary text-primary-foreground',
                    isCurrent && 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2',
                    !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                </div>
                <span className={cn(
                  'text-xs mt-1 text-center hidden sm:block',
                  isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}>
                  {stepLabels[language][i]}
                </span>
              </div>
              {i < totalSteps - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1 mx-2',
                    stepNum < currentStep ? 'bg-primary' : 'bg-muted'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="text-center text-sm text-muted-foreground mt-2">
        {language === 'en' 
          ? `Step ${currentStep} of ${totalSteps}` 
          : `Hatua ${currentStep} ya ${totalSteps}`}
      </div>
    </div>
  );
};

export default OnboardingProgress;
