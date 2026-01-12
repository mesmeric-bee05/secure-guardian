import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  FileText, 
  Plus, 
  Pencil, 
  Trash2,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

interface Protocol {
  id: string;
  title_en: string;
  title_sw: string;
  content_en: string;
  content_sw: string;
  category: string;
  severity: string | null;
  steps: Json;
  red_flags: string[] | null;
  seek_help_when: string[] | null;
  created_at: string | null;
  updated_at: string | null;
}

const categories = [
  'Bleeding & Wounds',
  'Burns',
  'Breathing Emergencies',
  'Cardiac Emergencies',
  'Fractures & Sprains',
  'Poisoning',
  'Bites & Stings',
  'Heat & Cold Emergencies',
  'Allergic Reactions',
  'Childbirth Emergencies',
  'Mental Health Crisis',
  'Other',
];

const severityLevels = ['mild', 'moderate', 'severe', 'life-threatening'];

const emptyProtocol = {
  title_en: '',
  title_sw: '',
  content_en: '',
  content_sw: '',
  category: '',
  severity: 'moderate',
  steps: [] as { step_en: string; step_sw: string }[],
  red_flags: [] as string[],
  seek_help_when: [] as string[],
};

export function ProtocolsTab() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [formData, setFormData] = useState(emptyProtocol);
  const [stepsInput, setStepsInput] = useState('');
  const [stepsSwInput, setStepsSwInput] = useState('');
  const [redFlagsInput, setRedFlagsInput] = useState('');
  const [seekHelpInput, setSeekHelpInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProtocols();
  }, []);

  const fetchProtocols = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('first_aid_protocols')
        .select('*')
        .order('category', { ascending: true });

      if (error) throw error;
      setProtocols(data || []);
    } catch (error) {
      console.error('Error fetching protocols:', error);
      toast.error('Failed to load protocols');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setSelectedProtocol(null);
    setFormData(emptyProtocol);
    setStepsInput('');
    setStepsSwInput('');
    setRedFlagsInput('');
    setSeekHelpInput('');
    setIsFormModalOpen(true);
  };

  const openEditModal = (protocol: Protocol) => {
    setSelectedProtocol(protocol);
    
    // Parse steps
    const steps = Array.isArray(protocol.steps) ? protocol.steps as { step_en: string; step_sw: string }[] : [];
    
    setFormData({
      title_en: protocol.title_en,
      title_sw: protocol.title_sw,
      content_en: protocol.content_en,
      content_sw: protocol.content_sw,
      category: protocol.category,
      severity: protocol.severity || 'moderate',
      steps,
      red_flags: protocol.red_flags || [],
      seek_help_when: protocol.seek_help_when || [],
    });
    
    setStepsInput(steps.map(s => s.step_en).join('\n'));
    setStepsSwInput(steps.map(s => s.step_sw).join('\n'));
    setRedFlagsInput(protocol.red_flags?.join('\n') || '');
    setSeekHelpInput(protocol.seek_help_when?.join('\n') || '');
    setIsFormModalOpen(true);
  };

  const openDeleteModal = (protocol: Protocol) => {
    setSelectedProtocol(protocol);
    setIsDeleteModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.title_en || !formData.title_sw || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);

      // Parse steps from multiline input
      const stepsEn = stepsInput.split('\n').filter(Boolean);
      const stepsSw = stepsSwInput.split('\n').filter(Boolean);
      const steps = stepsEn.map((step, i) => ({
        step_en: step.trim(),
        step_sw: stepsSw[i]?.trim() || step.trim(),
      }));

      const redFlags = redFlagsInput.split('\n').map(s => s.trim()).filter(Boolean);
      const seekHelpWhen = seekHelpInput.split('\n').map(s => s.trim()).filter(Boolean);

      const protocolData = {
        title_en: formData.title_en,
        title_sw: formData.title_sw,
        content_en: formData.content_en,
        content_sw: formData.content_sw,
        category: formData.category,
        severity: formData.severity,
        steps: steps as unknown as Json,
        red_flags: redFlags,
        seek_help_when: seekHelpWhen,
      };

      if (selectedProtocol) {
        // Update existing
        const { error } = await supabase
          .from('first_aid_protocols')
          .update(protocolData)
          .eq('id', selectedProtocol.id);

        if (error) throw error;

        // Log the action
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('audit_logs').insert({
          user_id: user?.id,
          action: 'update_protocol',
          resource_type: 'first_aid_protocols',
          resource_id: selectedProtocol.id,
          details: { protocol_title: formData.title_en },
        });

        toast.success('Protocol updated successfully');
      } else {
        // Create new
        const { data, error } = await supabase
          .from('first_aid_protocols')
          .insert(protocolData)
          .select()
          .single();

        if (error) throw error;

        // Log the action
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('audit_logs').insert({
          user_id: user?.id,
          action: 'create_protocol',
          resource_type: 'first_aid_protocols',
          resource_id: data.id,
          details: { protocol_title: formData.title_en },
        });

        toast.success('Protocol created successfully');
      }

      setIsFormModalOpen(false);
      fetchProtocols();
    } catch (error) {
      console.error('Error saving protocol:', error);
      toast.error('Failed to save protocol');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProtocol) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('first_aid_protocols')
        .delete()
        .eq('id', selectedProtocol.id);

      if (error) throw error;

      // Log the action
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action: 'delete_protocol',
        resource_type: 'first_aid_protocols',
        resource_id: selectedProtocol.id,
        details: { protocol_title: selectedProtocol.title_en },
      });

      toast.success('Protocol deleted successfully');
      setIsDeleteModalOpen(false);
      fetchProtocols();
    } catch (error) {
      console.error('Error deleting protocol:', error);
      toast.error('Failed to delete protocol');
    } finally {
      setSaving(false);
    }
  };

  const filteredProtocols = protocols.filter((p) => {
    const matchesSearch = p.title_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.title_sw.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const getSeverityColor = (severity: string | null) => {
    switch (severity) {
      case 'mild':
        return 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]';
      case 'moderate':
        return 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]';
      case 'severe':
        return 'bg-destructive/10 text-destructive';
      case 'life-threatening':
        return 'bg-[hsl(var(--critical))]/10 text-[hsl(var(--critical))]';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              First Aid Protocols
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search protocols..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full sm:w-60"
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={openAddModal}>
                <Plus className="w-4 h-4 mr-2" />
                Add Protocol
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title (EN)</TableHead>
                    <TableHead>Title (SW)</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Steps</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProtocols.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No protocols found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProtocols.map((protocol) => (
                      <TableRow key={protocol.id}>
                        <TableCell className="font-medium">{protocol.title_en}</TableCell>
                        <TableCell>{protocol.title_sw}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{protocol.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(protocol.severity)}`}>
                            {protocol.severity || 'N/A'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {Array.isArray(protocol.steps) ? protocol.steps.length : 0} steps
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditModal(protocol)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteModal(protocol)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Protocol Modal */}
      <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedProtocol ? 'Edit Protocol' : 'Add New Protocol'}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="steps">Steps & Warnings</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title_en">Title (English) *</Label>
                  <Input
                    id="title_en"
                    value={formData.title_en}
                    onChange={(e) => setFormData({ ...formData, title_en: e.target.value })}
                    placeholder="How to treat a burn"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title_sw">Title (Swahili) *</Label>
                  <Input
                    id="title_sw"
                    value={formData.title_sw}
                    onChange={(e) => setFormData({ ...formData, title_sw: e.target.value })}
                    placeholder="Jinsi ya kutibu kuungua"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="severity">Severity</Label>
                  <Select
                    value={formData.severity || 'moderate'}
                    onValueChange={(value) => setFormData({ ...formData, severity: value })}
                  >
                    <SelectTrigger id="severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {severityLevels.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="content_en">Content (English)</Label>
                <Textarea
                  id="content_en"
                  value={formData.content_en}
                  onChange={(e) => setFormData({ ...formData, content_en: e.target.value })}
                  placeholder="Detailed explanation in English..."
                  rows={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content_sw">Content (Swahili)</Label>
                <Textarea
                  id="content_sw"
                  value={formData.content_sw}
                  onChange={(e) => setFormData({ ...formData, content_sw: e.target.value })}
                  placeholder="Maelezo ya kina kwa Kiswahili..."
                  rows={6}
                />
              </div>
            </TabsContent>

            <TabsContent value="steps" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="steps_en">Steps (English, one per line)</Label>
                  <Textarea
                    id="steps_en"
                    value={stepsInput}
                    onChange={(e) => setStepsInput(e.target.value)}
                    placeholder="Step 1: Cool the burn under running water&#10;Step 2: Cover with a clean bandage&#10;Step 3: Take pain relief if needed"
                    rows={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="steps_sw">Steps (Swahili, one per line)</Label>
                  <Textarea
                    id="steps_sw"
                    value={stepsSwInput}
                    onChange={(e) => setStepsSwInput(e.target.value)}
                    placeholder="Hatua 1: Poza kuungua chini ya maji yanayotiririka&#10;Hatua 2: Funika na bandeji safi&#10;Hatua 3: Tumia dawa ya maumivu ikihitajika"
                    rows={6}
                  />
                </div>
              </div>

              <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg space-y-4">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <Label className="text-destructive font-medium">Warning Signs</Label>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="red_flags">Red Flags (one per line)</Label>
                  <Textarea
                    id="red_flags"
                    value={redFlagsInput}
                    onChange={(e) => setRedFlagsInput(e.target.value)}
                    placeholder="Severe blistering&#10;Burn covers large area&#10;Signs of infection"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seek_help">When to Seek Help (one per line)</Label>
                  <Textarea
                    id="seek_help"
                    value={seekHelpInput}
                    onChange={(e) => setSeekHelpInput(e.target.value)}
                    placeholder="Burns on face, hands, or genitals&#10;Chemical or electrical burns&#10;Difficulty breathing"
                    rows={3}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsFormModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : selectedProtocol ? (
                'Update Protocol'
              ) : (
                'Add Protocol'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Protocol</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{selectedProtocol?.title_en}</strong>? 
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
