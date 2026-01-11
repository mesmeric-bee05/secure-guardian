import { MapPin, Clock, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Language, t } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface EmergencyCase {
  id: string;
  symptoms: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'escalated';
  location_address: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
  } | null;
}

interface CaseCardProps {
  case_: EmergencyCase;
  language: Language;
  onClick: () => void;
}

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  in_progress: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  resolved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  escalated: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const CaseCard = ({ case_, language, onClick }: CaseCardProps) => {
  const timeAgo = formatDistanceToNow(new Date(case_.created_at), { addSuffix: true });

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-all active:scale-[0.99]"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs", priorityColors[case_.priority])}>
              {t(case_.priority as keyof typeof t extends 'low' | 'medium' | 'high' | 'critical' ? 'low' : 'low', language)}
              {case_.priority.charAt(0).toUpperCase() + case_.priority.slice(1)}
            </Badge>
            <Badge variant="outline" className={cn("text-xs", statusColors[case_.status])}>
              {case_.status.replace('_', ' ')}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo}
          </span>
        </div>

        <p className="text-sm font-medium line-clamp-2 mb-2">{case_.symptoms}</p>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {case_.profiles?.full_name && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {case_.profiles.full_name}
            </span>
          )}
          {case_.location_address && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{case_.location_address}</span>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CaseCard;
