import { User, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { t, Language } from '@/lib/translations';

interface ProfileHeaderProps {
  fullName: string;
  language: Language;
  onLogout: () => void;
}

const ProfileHeader = ({ fullName, language, onLogout }: ProfileHeaderProps) => {
  const navigate = useNavigate();
  
  const initials = fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-6 pb-16 relative">
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="text-primary-foreground hover:bg-primary-foreground/20"
        >
          {t('back', language)}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="text-primary-foreground hover:bg-primary-foreground/20 gap-1.5"
        >
          <LogOut className="h-4 w-4" />
          {t('logout', language)}
        </Button>
      </div>
      
      <div className="flex flex-col items-center">
        <Avatar className="h-20 w-20 border-4 border-primary-foreground/20">
          <AvatarFallback className="bg-primary-foreground text-primary text-xl font-bold">
            {initials || <User className="h-8 w-8" />}
          </AvatarFallback>
        </Avatar>
        <h1 className="mt-3 text-xl font-bold">{fullName}</h1>
      </div>
    </div>
  );
};

export default ProfileHeader;
