import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ArrowLeft, Mail, Phone, Calendar, Shield, User, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

function FROWorkerAssignment({ agentId, agentName }: { agentId: string; agentName: string }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [assigning, setAssigning] = useState(false);

  const { data: assignedWorkers = [], isLoading: loadingAssigned } = useQuery({
    queryKey: ['worker-assignments', agentId],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_worker_agents', { p_agent_id: agentId });
      return typeof data === 'string' ? JSON.parse(data) : (data || []);
    },
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ['worker-search', searchQuery],
    queryFn: async () => {
      const { data } = await supabase.rpc('search_workers_for_agent', {
        p_agent_id: agentId,
        p_search: searchQuery,
      });
      return typeof data === 'string' ? JSON.parse(data) : (data || []);
    },
    enabled: searchQuery.length >= 2,
  });

  const handleAssign = async (workerId: string) => {
    setAssigning(true);
    try {
      const { error } = await supabase.rpc('assign_agent_to_worker', {
        p_worker_id: workerId,
        p_agent_id: agentId,
      });
      if (error) throw error;
      toast.success('Worker assigned');
      queryClient.invalidateQueries({ queryKey: ['worker-assignments', agentId] });
      setSearchQuery('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (workerId: string) => {
    try {
      const { error } = await supabase.rpc('unassign_agent_from_worker', {
        p_worker_id: workerId,
        p_agent_id: agentId,
      });
      if (error) throw error;
      toast.success('Worker unassigned');
      queryClient.invalidateQueries({ queryKey: ['worker-assignments', agentId] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to unassign');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> FRO Worker Assignments
        </CardTitle>
        <CardDescription>
          Assign FRO workers to {agentName}. Their WhatsApp messages will route through this agent's accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search to assign */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workers by name or email to assign..."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-48 overflow-y-auto">
              {searchResults.map((w: any) => (
                <button
                  key={w.id}
                  onClick={() => handleAssign(w.id)}
                  disabled={assigning}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {(w.name?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{w.name || 'No Name'}</p>
                    <p className="text-xs text-muted-foreground truncate">{w.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Assigned workers */}
        {loadingAssigned ? (
          <p className="text-xs text-muted-foreground">Loading assigned workers...</p>
        ) : assignedWorkers.length > 0 ? (
          <div className="space-y-2">
            {assignedWorkers.map((w: any) => (
              <div key={w.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {(w.name?.[0] || '?').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{w.name || 'No Name'}</p>
                    <p className="text-xs text-muted-foreground">{w.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleUnassign(w.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Unassign worker"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            No FRO workers assigned yet. Search above to assign workers.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function TeamMemberPage() {
  const { workerId } = useParams<{ workerId: string }>();

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['team-members-page'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_whatsapp_users');
      if (error) return [];
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return parsed || [];
    },
  });

  const member = (teamMembers || []).find((m: any) => m.id === workerId);

  const roleDisplay: Record<string, string> = {
    admin: 'Admin',
    agent: 'Agent',
    viewer: 'Viewer',
  };

  const roleBadgeVariant: Record<string, 'default' | 'success' | 'warning' | 'error' | 'neutral'> = {
    admin: 'error',
    agent: 'default',
    viewer: 'neutral',
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading member details...</p>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="p-6 space-y-4">
        <Link to="/team" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to Team
        </Link>
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">Team member not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <Link to="/team" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to Team
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column - Profile Card */}
        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-6 border-b">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/5 text-primary text-2xl font-bold mb-4">
              {(member.name?.[0] || member.email?.[0] || '?').toUpperCase()}
            </div>
            <CardTitle className="text-lg font-bold">{member.name || 'No Name'}</CardTitle>
            <CardDescription className="text-xs">{member.email}</CardDescription>
            <div className="mt-4">
              <Badge variant={roleBadgeVariant[member.role] || 'neutral'}>
                {roleDisplay[member.role] || member.role}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4 text-xs">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Shield className="h-4 w-4 shrink-0" />
              <span>Role: <strong>{roleDisplay[member.role] || member.role}</strong></span>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>Joined: <strong>{member.created_at ? new Date(member.created_at).toLocaleDateString() : 'N/A'}</strong></span>
            </div>
          </CardContent>
        </Card>

        {/* Right Column - Details */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <User className="h-4 w-4" /> Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Full Name</span>
                <p className="font-medium">{member.name || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Email Address</span>
                <p className="font-medium flex items-center gap-1.5 truncate">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" /> <span className="truncate">{member.email}</span>
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Phone Number</span>
                <p className="font-medium flex items-center gap-1.5">
                  <Phone className="h-4 w-4 text-muted-foreground" /> {member.phone || 'N/A'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Account Status</span>
                <p className="font-medium">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${member.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {member.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                </p>
              </div>
            </div>
           </CardContent>
        </Card>
      </div>

      {/* FRO Worker Assignments */}
      {member.role === 'agent' && (
        <FROWorkerAssignment agentId={member.id} agentName={member.name || member.email} />
      )}
    </div>
  );
}
