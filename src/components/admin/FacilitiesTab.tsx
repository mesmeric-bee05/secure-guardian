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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { 
  Search, 
  Building2, 
  Plus, 
  Pencil, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  Loader2,
  MapPin
} from 'lucide-react';
import { toast } from 'sonner';

interface Facility {
  id: string;
  name: string;
  facility_type: 'hospital' | 'clinic' | 'pharmacy' | 'health_center';
  address: string;
  city: string;
  region: string | null;
  phone_number: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  is_verified: boolean | null;
  is_24_hours: boolean | null;
  has_ambulance: boolean | null;
  services: string[] | null;
  created_at: string | null;
}

const facilityTypes = ['hospital', 'clinic', 'pharmacy', 'health_center'] as const;

const emptyFacility: Omit<Facility, 'id' | 'created_at'> = {
  name: '',
  facility_type: 'clinic',
  address: '',
  city: '',
  region: '',
  phone_number: '',
  email: '',
  latitude: null,
  longitude: null,
  is_verified: false,
  is_24_hours: false,
  has_ambulance: false,
  services: [],
};

export function FacilitiesTab() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [formData, setFormData] = useState(emptyFacility);
  const [servicesInput, setServicesInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFacilities();
  }, []);

  const fetchFacilities = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('health_facilities')
        .select('*')
        .order('name');

      if (error) throw error;
      setFacilities(data || []);
    } catch (error) {
      console.error('Error fetching facilities:', error);
      toast.error('Failed to load facilities');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setSelectedFacility(null);
    setFormData(emptyFacility);
    setServicesInput('');
    setIsFormModalOpen(true);
  };

  const openEditModal = (facility: Facility) => {
    setSelectedFacility(facility);
    setFormData({
      name: facility.name,
      facility_type: facility.facility_type,
      address: facility.address,
      city: facility.city,
      region: facility.region || '',
      phone_number: facility.phone_number || '',
      email: facility.email || '',
      latitude: facility.latitude,
      longitude: facility.longitude,
      is_verified: facility.is_verified || false,
      is_24_hours: facility.is_24_hours || false,
      has_ambulance: facility.has_ambulance || false,
      services: facility.services || [],
    });
    setServicesInput(facility.services?.join(', ') || '');
    setIsFormModalOpen(true);
  };

  const openDeleteModal = (facility: Facility) => {
    setSelectedFacility(facility);
    setIsDeleteModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.address || !formData.city) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      setSaving(true);

      const services = servicesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const facilityData = {
        ...formData,
        services,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
      };

      if (selectedFacility) {
        // Update existing
        const { error } = await supabase
          .from('health_facilities')
          .update(facilityData)
          .eq('id', selectedFacility.id);

        if (error) throw error;

        // Log the action
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('audit_logs').insert({
          user_id: user?.id,
          action: 'update_facility',
          resource_type: 'health_facilities',
          resource_id: selectedFacility.id,
          details: { facility_name: formData.name },
        });

        toast.success('Facility updated successfully');
      } else {
        // Create new
        const { data, error } = await supabase
          .from('health_facilities')
          .insert(facilityData)
          .select()
          .single();

        if (error) throw error;

        // Log the action
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('audit_logs').insert({
          user_id: user?.id,
          action: 'create_facility',
          resource_type: 'health_facilities',
          resource_id: data.id,
          details: { facility_name: formData.name },
        });

        toast.success('Facility created successfully');
      }

      setIsFormModalOpen(false);
      fetchFacilities();
    } catch (error) {
      console.error('Error saving facility:', error);
      toast.error('Failed to save facility');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFacility) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('health_facilities')
        .delete()
        .eq('id', selectedFacility.id);

      if (error) throw error;

      // Log the action
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action: 'delete_facility',
        resource_type: 'health_facilities',
        resource_id: selectedFacility.id,
        details: { facility_name: selectedFacility.name },
      });

      toast.success('Facility deleted successfully');
      setIsDeleteModalOpen(false);
      fetchFacilities();
    } catch (error) {
      console.error('Error deleting facility:', error);
      toast.error('Failed to delete facility');
    } finally {
      setSaving(false);
    }
  };

  const toggleVerification = async (facility: Facility) => {
    try {
      const newStatus = !facility.is_verified;
      const { error } = await supabase
        .from('health_facilities')
        .update({ is_verified: newStatus })
        .eq('id', facility.id);

      if (error) throw error;

      // Log the action
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action: newStatus ? 'verify_facility' : 'unverify_facility',
        resource_type: 'health_facilities',
        resource_id: facility.id,
        details: { facility_name: facility.name },
      });

      toast.success(newStatus ? 'Facility verified' : 'Facility unverified');
      fetchFacilities();
    } catch (error) {
      console.error('Error toggling verification:', error);
      toast.error('Failed to update verification status');
    }
  };

  const filteredFacilities = facilities.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || f.facility_type === filterType;
    return matchesSearch && matchesType;
  });

  const getFacilityTypeColor = (type: string) => {
    switch (type) {
      case 'hospital':
        return 'bg-destructive/10 text-destructive';
      case 'clinic':
        return 'bg-primary/10 text-primary';
      case 'pharmacy':
        return 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]';
      case 'health_center':
        return 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]';
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
              <Building2 className="w-5 h-5" />
              Health Facilities
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search facilities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full sm:w-60"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="hospital">Hospital</SelectItem>
                  <SelectItem value="clinic">Clinic</SelectItem>
                  <SelectItem value="pharmacy">Pharmacy</SelectItem>
                  <SelectItem value="health_center">Health Center</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={openAddModal}>
                <Plus className="w-4 h-4 mr-2" />
                Add Facility
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
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Features</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFacilities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No facilities found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFacilities.map((facility) => (
                      <TableRow key={facility.id}>
                        <TableCell className="font-medium">{facility.name}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getFacilityTypeColor(facility.facility_type)}`}>
                            {facility.facility_type.replace('_', ' ')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            {facility.city}
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => toggleVerification(facility)}
                            className="flex items-center gap-1 hover:opacity-80"
                          >
                            {facility.is_verified ? (
                              <CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))]" />
                            ) : (
                              <XCircle className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className="text-sm">
                              {facility.is_verified ? 'Verified' : 'Unverified'}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {facility.is_24_hours && (
                              <Badge variant="outline" className="text-xs">24h</Badge>
                            )}
                            {facility.has_ambulance && (
                              <Badge variant="outline" className="text-xs">Ambulance</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditModal(facility)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteModal(facility)}
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

      {/* Add/Edit Facility Modal */}
      <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedFacility ? 'Edit Facility' : 'Add New Facility'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Facility name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.facility_type}
                  onValueChange={(value: typeof facilityTypes[number]) =>
                    setFormData({ ...formData, facility_type: value })
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {facilityTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address *</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Full address"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input
                  id="region"
                  value={formData.region || ''}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  placeholder="Region/State"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone_number || ''}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  placeholder="+255 XXX XXX XXX"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  value={formData.latitude || ''}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="-6.7924"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  value={formData.longitude || ''}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="39.2083"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="services">Services (comma-separated)</Label>
              <Textarea
                id="services"
                value={servicesInput}
                onChange={(e) => setServicesInput(e.target.value)}
                placeholder="Emergency, Maternity, X-Ray, Laboratory, Pharmacy"
                rows={2}
              />
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="verified"
                  checked={formData.is_verified || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_verified: checked })}
                />
                <Label htmlFor="verified">Verified</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="24hours"
                  checked={formData.is_24_hours || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_24_hours: checked })}
                />
                <Label htmlFor="24hours">Open 24 Hours</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="ambulance"
                  checked={formData.has_ambulance || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, has_ambulance: checked })}
                />
                <Label htmlFor="ambulance">Has Ambulance</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : selectedFacility ? (
                'Update Facility'
              ) : (
                'Add Facility'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Facility</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{selectedFacility?.name}</strong>? 
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
