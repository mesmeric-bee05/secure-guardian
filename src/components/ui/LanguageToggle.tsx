import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LanguageToggleProps {
  language: 'en' | 'sw';
  onToggle: (lang: 'en' | 'sw') => void;
  className?: string;
}

const LanguageToggle = ({ language, onToggle, className }: LanguageToggleProps) => {
  return (
    <div className={cn("flex items-center gap-1 bg-muted rounded-full p-1", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggle('en')}
        className={cn(
          "rounded-full px-3 py-1 h-7 text-xs font-medium transition-all",
          language === 'en' 
            ? "bg-primary text-primary-foreground shadow-sm" 
            : "hover:bg-muted-foreground/10"
        )}
      >
        EN
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggle('sw')}
        className={cn(
          "rounded-full px-3 py-1 h-7 text-xs font-medium transition-all",
          language === 'sw' 
            ? "bg-primary text-primary-foreground shadow-sm" 
            : "hover:bg-muted-foreground/10"
        )}
      >
        SW
      </Button>
    </div>
  );
};

export default LanguageToggle;
