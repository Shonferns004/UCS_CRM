import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Users, Mail, Phone, Calendar, ArrowRight } from 'lucide-react';

export function TeamPage() {
  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['team-members-page'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_whatsapp_users');
      if (error) return [];
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return parsed || [];
    },
  });

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

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Team Members
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your organization's team members and their roles.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading team members...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(teamMembers || []).map((m: any) => (
            <Card key={m.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/5 text-primary text-sm font-semibold shrink-0">
                      {(m.name?.[0] || m.email?.[0] || '?').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{m.name || 'No Name'}</h3>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                  </div>
                  <Badge variant={roleBadgeVariant[m.role] || 'neutral'}>
                    {roleDisplay[m.role] || m.role}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pb-6 text-xs">
                <div className="flex flex-col gap-1.5 text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    <span className="truncate">{m.email}</span>
                  </div>
                  {m.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{m.phone}</span>
                    </div>
                  )}
                  {m.created_at && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Joined {new Date(m.created_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t flex justify-end">
                  <Link
                    to={`/team/${m.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    View Details <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!teamMembers || teamMembers.length === 0) && (
            <div className="col-span-full rounded-lg border border-dashed p-12 text-center">
              <Users className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-4 text-sm font-semibold">No team members</h3>
              <p className="mt-1 text-xs text-muted-foreground">Get started by adding a team member in Settings.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
