import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface CaseData {
  id: string;
  symptoms: string;
  priority: string | null;
  status: string | null;
  created_at: string | null;
  resolved_at: string | null;
  assigned_chw_id: string | null;
  location_address: string | null;
}

interface CSVExportButtonProps {
  cases: CaseData[];
  className?: string;
}

export function CSVExportButton({ cases, className }: CSVExportButtonProps) {
  const exportCSV = () => {
    if (cases.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['ID', 'Symptoms', 'Priority', 'Status', 'Created At', 'Resolved At', 'Assigned CHW', 'Location'];
    const rows = cases.map(c => [
      c.id,
      `"${(c.symptoms || '').replace(/"/g, '""')}"`,
      c.priority || '',
      c.status || '',
      c.created_at || '',
      c.resolved_at || '',
      c.assigned_chw_id || '',
      `"${(c.location_address || '').replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cases-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${cases.length} cases`);
  };

  return (
    <Button variant="outline" size="sm" onClick={exportCSV} className={className}>
      <Download className="h-4 w-4 mr-2" />
      Export CSV
    </Button>
  );
}
