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
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  UserCog, 
  MapPin, 
  Plus, 
  Loader2, 
  Edit, 
  Trash2,
  Users,
  Activity,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

interface CHWAssignment {
  id: string;
  chw_user_id: string;
  region: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  coverage_radius_km: number | null;
  is_active: boolean | null;
  assigned_at: string | null;
  // Joined data
  full_name?: string;
  phone_number?: string;
  active_cases?: number;
  resolved_cases?: number;
}

interface UserForAssignment {
  user_id: string;
  full_name: string;
  phone_number: string | null;
}

const regions = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret',
  'Machakos', 'Meru', 'Nyeri', 'Kakamega', 'Kisii',
  'Garissa', 'Malindi', 'Thika', 'Kitale', 'Kericho',
];

export function CHWManagementTab() {
  const [assignments, setAssignments] = useState<CHWAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<CHWAssignment | null>(null);
  const [saving, setSaving] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<UserForAssignment[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    chw_user_id: '',
    region: '',
    city: '',
    latitude: '',
    longitude: '',
    coverage_radius_km: 10,
    is_active: true,
  });

  // Stats
  const [stats, setStats] = useState({
    totalCHWs: 0,
    activeCHWs: 0,
    totalCases: 0,
    resolvedCases: 0,
  });

  useEffect(() => {
    fetchAssignments();
    fetchAvailableUsers();
  }, []);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      
      // Fetch CHW assignments
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('chw_assignments')
        .select('*')
        .order('assigned_at', { ascending: false });

      if (assignmentError) throw assignmentError;

      // Fetch profiles for CHWs
      const chwUserIds = assignmentData?.map(a => a.chw_user_id) || [];
      
      if (chwUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, phone_number')
          .in('user_id', chwUserIds);

        // Fetch case counts
        const { data: cases } = await supabase
          .from('emergency_cases')
          .select('assigned_chw_id, status');

        const profilesMap: Record<string, { full_name: string; phone_number: string | null }> = {};
        profiles?.forEach(p => {
          profilesMap[p.user_id] = { full_name: p.full_name, phone_number: p.phone_number };
        });

        const caseCountsMap: Record<string, { active: number; resolved: number }> = {};
        cases?.forEach(c => {
          if (c.assigned_chw_id) {
            if (!caseCountsMap[c.assigned_chw_id]) {
              caseCountsMap[c.assigned_chw_id] = { active: 0, resolved: 0 };
            }
            if (c.status === 'resolved') {
              caseCountsMap[c.assigned_chw_id].resolved++;
            } else {
              caseCountsMap[c.assigned_chw_id].active++;
            }
          }
        });

        const enrichedAssignments = assignmentData?.map(a => ({
          ...a,
          full_name: profilesMap[a.chw_user_id]?.full_name || 'Unknown',
          phone_number: profilesMap[a.chw_user_id]?.phone_number,
          active_cases: caseCountsMap[a.chw_user_id]?.active || 0,
          resolved_cases: caseCountsMap[a.chw_user_id]?.resolved || 0,
        })) || [];

        setAssignments(enrichedAssignments);

        // Calculate stats
        const activeCHWs = enrichedAssignments.filter(a => a.is_active).length;
        const totalActive = Object.values(caseCountsMap).reduce((sum, c) => sum + c.active, 0);
        const totalResolved = Object.values(caseCountsMap).reduce((sum, c) => sum + c.resolved, 0);

        setStats({
          totalCHWs: enrichedAssignments.length,
          activeCHWs,
          totalCases: totalActive,
          resolvedCases: totalResolved,
        });
      } else {
        setAssignments([]);
        setStats({ totalCHWs: 0, activeCHWs: 0, totalCases: 0, resolvedCases: 0 });
      }
    } catch (error) {
      console.error('Error fetching CHW assignments:', error);
      toast.error('Failed to load CHW data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      // Get users with CHW role
      const { data: chwRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'chw');

      if (chwRoles && chwRoles.length > 0) {
        const chwUserIds = chwRoles.map(r => r.user_id);
        
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, phone_number')
          .in('user_id', chwUserIds);

        setAvailableUsers(profiles || []);
      }
    } catch (error) {
      console.error('Error fetching available users:', error);
    }
  };

  const openCreateModal = () => {
    setSelectedAssignment(null);
    setFormData({
      chw_user_id: '',
      region: '',
      city: '',
      latitude: '',
      longitude: '',
      coverage_radius_km: 10,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (assignment: CHWAssignment) => {
    setSelectedAssignment(assignment);
    setFormData({
      chw_user_id: assignment.chw_user_id,
      region: assignment.region,
      city: assignment.city || '',
      latitude: assignment.latitude?.toString() || '',
      longitude: assignment.longitude?.toString() || '',
      coverage_radius_km: assignment.coverage_radius_km || 10,
      is_active: assignment.is_active ?? true,
    });
    setIsModalOpen(true);
  };

  const openDeleteModal = (assignment: CHWAssignment) => {
    setSelectedAssignment(assignment);
    setIsDeleteModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.chw_user_id || !formData.region) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        chw_user_id: formData.chw_user_id,
        region: formData.region,
        city: formData.city || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        coverage_radius_km: formData.coverage_radius_km,
        is_active: formData.is_active,
      };

      if (selectedAssignment) {
        // Update
        const { error } = await supabase
          .from('chw_assignments')
          .update(payload)
          .eq('id', selectedAssignment.id);

        if (error) throw error;
        toast.success('CHW assignment updated');
      } else {
        // Create
        const { error } = await supabase
          .from('chw_assignments')
          .insert(payload);

        if (error) throw error;
        toast.success('CHW assignment created');
      }

      // Log action
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action: selectedAssignment ? 'update_chw_assignment' : 'create_chw_assignment',
        resource_type: 'chw_assignments',
        resource_id: selectedAssignment?.id || formData.chw_user_id,
        details: payload,
      });

      setIsModalOpen(false);
      fetchAssignments();
    } catch (error) {
      console.error('Error saving CHW assignment:', error);
      toast.error('Failed to save assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAssignment) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('chw_assignments')
        .delete()
        .eq('id', selectedAssignment.id);

      if (error) throw error;

      // Log action
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action: 'delete_chw_assignment',
        resource_type: 'chw_assignments',
        resource_id: selectedAssignment.id,
        details: { chw_name: selectedAssignment.full_name, region: selectedAssignment.region },
      });

      toast.success('CHW assignment deleted');
      setIsDeleteModalOpen(false);
      fetchAssignments();
    } catch (error) {
      console.error('Error deleting CHW assignment:', error);
      toast.error('Failed to delete assignment');
    } finally {
      setSaving(false);
    }
  };

  const filteredAssignments = assignments.filter(
    (a) =>
      a.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalCHWs}</p>
                <p className="text-xs text-muted-foreground">Total CHWs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-500/10">
                <Activity className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.activeCHWs}</p>
                <p className="text-xs text-muted-foreground">Active CHWs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-amber-500/10">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalCases}</p>
                <p className="text-xs text-muted-foreground">Active Cases</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-500/10">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.resolvedCases}</p>
                <p className="text-xs text-muted-foreground">Resolved Cases</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CHW Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              CHW Assignments
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search CHWs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button onClick={openCreateModal}>
                <Plus className="w-4 h-4 mr-2" />
                Add CHW
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
                    <TableHead>Name</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Coverage</TableHead>
                    <TableHead>Active Cases</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No CHW assignments found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAssignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{assignment.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {assignment.phone_number || 'No phone'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <span>{assignment.region}</span>
                            {assignment.city && (
                              <span className="text-muted-foreground">
                                , {assignment.city}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {assignment.coverage_radius_km || 10} km
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-amber-600 border-amber-500/30">
                              {assignment.active_cases} active
                            </Badge>
                            <Badge variant="outline" className="text-green-600 border-green-500/30">
                              {assignment.resolved_cases} resolved
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={assignment.is_active ? 'default' : 'secondary'}
                          >
                            {assignment.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditModal(assignment)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteModal(assignment)}
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

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              {selectedAssignment ? 'Edit CHW Assignment' : 'Add CHW Assignment'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Community Health Worker *</Label>
              <Select
                value={formData.chw_user_id}
                onValueChange={(value) => setFormData({ ...formData, chw_user_id: value })}
                disabled={!!selectedAssignment}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select CHW" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.full_name} {user.phone_number ? `(${user.phone_number})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Region *</Label>
              <Select
                value={formData.region}
                onValueChange={(value) => setFormData({ ...formData, region: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>City</Label>
              <Input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Enter city"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Latitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                  placeholder="-1.2864"
                />
              </div>
              <div className="space-y-2">
                <Label>Longitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                  placeholder="36.8172"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Coverage Radius: {formData.coverage_radius_km} km</Label>
              <Slider
                value={[formData.coverage_radius_km]}
                onValueChange={(value) => setFormData({ ...formData, coverage_radius_km: value[0] })}
                min={5}
                max={50}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                Area this CHW covers for emergency assignments
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Active Status</Label>
                <p className="text-xs text-muted-foreground">
                  Can receive new case assignments
                </p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete CHW Assignment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the assignment for{' '}
              <strong>{selectedAssignment?.full_name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
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
