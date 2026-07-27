import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ArrowLeft, Mail, Phone, User, UserPlus, UserMinus, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

function FROWorkerAssignment({ agentId, agentName }: { agentId: string; agentName: string }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [pendingWorker, setPendingWorker] = useState<any>(null);

  const { data: agentAccounts = [] } = useQuery({
    queryKey: ['agent-accounts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_accounts')
        .select('id, name, project, phone_number_id, is_active')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
  });

  const { data: assignedWorkers = [], isLoading: loadingAssigned } = useQuery({
    queryKey: ['worker-assignments', agentId],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_agent_workers', { p_agent_id: agentId });
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

  const handleWorkerClick = (worker: any) => {
    setPendingWorker(worker);
    setSelectedAccount(null);
    setSearchQuery('');
  };

  const handleConfirmAssign = async () => {
    if (!pendingWorker) return;
    setAssigning(true);
    try {
      const { error } = await supabase.rpc('assign_agent_to_worker', {
        p_worker_id: pendingWorker.id,
        p_agent_id: agentId,
        p_account_id: selectedAccount,
      });
      if (error) throw error;
      toast.success(`${pendingWorker.name || 'Worker'} assigned`);
      queryClient.invalidateQueries({ queryKey: ['worker-assignments', agentId] });
      setPendingWorker(null);
      setSelectedAccount(null);
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

  const agentAccountsList: any[] = (agentAccounts as any[]).filter(a => a?.is_active !== false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> FRO Worker Assignments
        </CardTitle>
        <CardDescription>
          Assign FRO workers to {agentName}. Select which WhatsApp number each worker gets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPendingWorker(null); }}
            placeholder="Search workers by name or email..."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {searchResults.length > 0 && !pendingWorker && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-48 overflow-y-auto">
              {searchResults.map((w: any) => (
                <button
                  key={w.id}
                  onClick={() => handleWorkerClick(w)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
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

        {pendingWorker && (
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {(pendingWorker.name?.[0] || '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{pendingWorker.name || 'No Name'}</p>
                <p className="text-xs text-muted-foreground">{pendingWorker.email}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Select WhatsApp Number</label>
              <div className="grid grid-cols-1 gap-1.5">
                {agentAccountsList.map((a: any) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAccount(a.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      selectedAccount === a.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent'
                    }`}
                  >
                    <CheckCircle2 className={`h-4 w-4 shrink-0 ${selectedAccount === a.id ? 'text-primary' : 'text-muted-foreground/40'}`} />
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary shrink-0">
                      {(a.name?.[0] || '?').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-[11px] text-muted-foreground">{a.project?.toUpperCase()} &middot; {a.phone_number_id}</p>
                    </div>
                  </button>
                ))}
                {agentAccountsList.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">No WhatsApp accounts assigned to this agent.</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirmAssign}
                disabled={assigning || selectedAccount === null}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {assigning ? 'Assigning...' : 'Confirm Assignment'}
              </button>
              <button
                onClick={() => { setPendingWorker(null); setSelectedAccount(null); }}
                className="rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loadingAssigned ? (
          <p className="text-xs text-muted-foreground">Loading assigned workers...</p>
        ) : assignedWorkers.length > 0 ? (
          <div className="space-y-2">
            {assignedWorkers.map((w: any) => (
              <div key={w.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {(w.name?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{w.name || 'No Name'}</p>
                    <p className="text-xs text-muted-foreground">{w.email}</p>
                    {w.assigned_account_name ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {w.assigned_account_name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{w.assigned_account_project?.toUpperCase()}</span>
                      </div>
                    ) : null}
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

      <div className="flex items-start gap-6">
        <Card className="w-64 shrink-0">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/5 text-primary text-2xl font-bold mb-3">
              {(member.name?.[0] || member.email?.[0] || '?').toUpperCase()}
            </div>
            <CardTitle className="text-lg font-bold">{member.name || 'No Name'}</CardTitle>
            <CardDescription className="text-xs flex items-center justify-center gap-1.5">
              <Mail className="h-3 w-3" /> {member.email}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 space-y-3 text-xs">
            {member.phone && (
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" />
                <span>{member.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${member.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {member.is_active !== false ? 'Active' : 'Inactive'}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex-1 min-w-0">
          {member.role === 'agent' && (
            <FROWorkerAssignment agentId={member.id} agentName={member.name || member.email} />
          )}
          {member.role !== 'agent' && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                FRO Worker Assignment is only available for Agent accounts.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
