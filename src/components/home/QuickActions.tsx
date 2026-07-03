import { useNavigate } from 'react-router-dom';
import { 
  MessageCircle, 
  MapPin, 
  User, 
  LayoutDashboard,
  Shield,
  Heart,
  ChevronRight 
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Language } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface QuickActionsProps {
  language: Language;
  isAuthenticated: boolean;
  isChw: boolean;
  isAdmin: boolean;
}

const QuickActions = ({ language, isAuthenticated, isChw, isAdmin }: QuickActionsProps) => {
  const navigate = useNavigate();

  const actions = [
    {
      id: 'chat',
      icon: MessageCircle,
      titleEn: 'AI First Aid',
      titleSw: 'Huduma ya Kwanza ya AI',
      descEn: 'Get instant health guidance',
      descSw: 'Pata mwongozo wa haraka wa afya',
      color: 'bg-emerald-500',
      path: '/chat',
      requiresAuth: true,
    },
    {
      id: 'emergency',
      icon: MapPin,
      titleEn: 'Find Hospital',
      titleSw: 'Tafuta Hospitali',
      descEn: 'Locate nearby facilities',
      descSw: 'Pata vituo vya karibu',
      color: 'bg-red-500',
      path: '/emergency',
      requiresAuth: true,
    },
    {
      id: 'profile',
      icon: User,
      titleEn: 'My Profile',
      titleSw: 'Wasifu Wangu',
      descEn: 'Manage your health info',
      descSw: 'Simamia taarifa zako za afya',
      color: 'bg-blue-500',
      path: '/profile',
      requiresAuth: true,
      showWhenAuth: true,
    },
    {
      id: 'dashboard',
      icon: LayoutDashboard,
      titleEn: 'CHW Dashboard',
      titleSw: 'Dashibodi ya CHW',
      descEn: 'Manage patient cases',
      descSw: 'Simamia kesi za wagonjwa',
      color: 'bg-purple-500',
      path: '/dashboard',
      requiresAuth: true,
      requiresChw: true,
    },
    {
      id: 'admin',
      icon: Shield,
      titleEn: 'Admin Panel',
      titleSw: 'Paneli ya Msimamizi',
      descEn: 'System administration',
      descSw: 'Usimamizi wa mfumo',
      color: 'bg-amber-500',
      path: '/admin',
      requiresAuth: true,
      requiresAdmin: true,
    },
  ];

  const visibleActions = actions.filter(action => {
    if (action.requiresChw && !isChw && !isAdmin) return false;
    if (action.requiresAdmin && !isAdmin) return false;
    if (action.showWhenAuth && !isAuthenticated) return false;
    return true;
  });

  const handleClick = (action: typeof actions[0]) => {
    if (action.requiresAuth && !isAuthenticated) {
      navigate('/auth');
    } else {
      navigate(action.path);
    }
  };

  return (
    <div className="px-4 py-6">
      <h2 className="text-lg font-semibold mb-4">
        {language === 'en' ? 'Quick Actions' : 'Vitendo vya Haraka'}
      </h2>
      
      <div className="grid gap-3">
        {visibleActions.map((action) => (
          <Card
            key={action.id}
            className="cursor-pointer hover:shadow-md transition-all active:scale-[0.99]"
            onClick={() => handleClick(action)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                  action.color
                )}>
                  <action.icon className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">
                      {language === 'en' ? action.titleEn : action.titleSw}
                    </h3>
                    {action.requiresAuth && !isAuthenticated && (
                      <Badge variant="secondary" className="text-xs">
                        {language === 'en' ? 'Login' : 'Ingia'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {language === 'en' ? action.descEn : action.descSw}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
