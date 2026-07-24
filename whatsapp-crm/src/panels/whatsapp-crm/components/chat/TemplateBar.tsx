import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { Loader2, LayoutTemplate, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { sendWhatsAppTemplate, extractPlaceholders } from '../../lib/whatsapp';
import { useAuthStore } from '../../stores/authStore';
import { TemplateParamsModal } from './TemplateParamsModal';
import { toast } from 'sonner';

interface TemplateRecord {
  id: number;
  name: string;
  language: string;
  category: string;
  status: string;
  components: any;
  project: string;
}

interface TemplateBarProps {
  conversationId: string;
  project?: string | null;
  onSent: () => void;
}

const META_API = 'https://graph.facebook.com/v23.0';

async function syncTemplatesFromMeta(project: string | null): Promise<boolean> {
  if (!project) return false;
  try {
    const { data: accounts } = await supabase
      .from('whatsapp_accounts')
      .select('waba_id, access_token')
      .eq('project', project)
      .limit(1);
    if (!accounts || accounts.length === 0) return false;
    const { waba_id, access_token } = accounts[0];
    if (!waba_id || !access_token) return false;

    const res = await fetch(`${META_API}/${waba_id}/message_templates?limit=50`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const result = await res.json();
    if (!result.data) return false;

    const { data: existing } = await supabase.from('whatsapp_templates').select('name, language').eq('project', project);
    const existingKeys = new Set((existing || []).map((e: any) => `${e.name}|${e.language}`));

    const toInsert: any[] = [];
    for (const tpl of result.data) {
      if (tpl.status !== 'APPROVED' && tpl.status !== 'PENDING') continue;
      const key = `${tpl.name}|${tpl.language}`;
      if (!existingKeys.has(key)) {
        toInsert.push({
          ngo_id: '2661d802-69c3-4634-aae9-7bbea7a87f0d',
          name: tpl.name,
          language: tpl.language,
          category: tpl.category || 'UTILITY',
          status: tpl.status.toLowerCase(),
          project: project,
          meta_template_id: tpl.id,
          components: tpl.components || [],
        });
      }
    }

    if (toInsert.length > 0) {
      await supabase.from('whatsapp_templates').insert(toInsert);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function TemplateBar({ conversationId, project, onSent }: TemplateBarProps) {
  const { user } = useAuthStore();
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [syncToken, setSyncToken] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [paramModal, setParamModal] = useState<{ template: TemplateRecord; contactId: string } | null>(null);

  const { data: templates, isLoading } = useQuery<TemplateRecord[]>({
    queryKey: ['chat-templates', project, syncToken, user?.id],
    queryFn: async () => {
      let q = supabase.from('whatsapp_templates').select('*').in('status', ['approved', 'pending']).order('name');

      let projectFilter = project;

      if (!projectFilter && user?.id) {
        const { data: assignments } = await supabase
          .from('agent_phone_assignments')
          .select('account_id')
          .eq('user_id', user.id);
        if (assignments && assignments.length > 0) {
          const ids = assignments.map((a: any) => a.account_id);
          const { data: accts } = await supabase
            .from('whatsapp_accounts')
            .select('project')
            .in('id', ids);
          const projects = (accts || [])
            .map((a: any) => a.project)
            .filter(Boolean) as string[];
          if (projects.length > 0) {
            q = q.in('project', projects);
            projectFilter = projects[0];
          }
        }
      }

      if (projectFilter) q = q.eq('project', projectFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as TemplateRecord[];
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let syncProject = project;
      if (!syncProject && user?.id) {
        const { data: assignments } = await supabase
          .from('agent_phone_assignments')
          .select('account_id')
          .eq('user_id', user.id);
        if (assignments && assignments.length > 0) {
          const ids = assignments.map((a: any) => a.account_id);
          const { data: accts } = await supabase
            .from('whatsapp_accounts')
            .select('project')
            .in('id', ids);
          const projects = (accts || []).map((a: any) => a.project).filter(Boolean) as string[];
          if (projects.length > 0) syncProject = projects[0];
        }
      }
      if (!syncProject) return;
      setSyncing(true);
      const changed = await syncTemplatesFromMeta(syncProject);
      if (cancelled) return;
      setSyncing(false);
      if (changed) setSyncToken((t) => t + 1);
    })();
    return () => { cancelled = true; };
  }, [project, user?.id]);

  const sendDirect = async (tpl: TemplateRecord) => {
    setSendingId(tpl.id);
    try {
      const { data: conv } = await supabase.from('conversations').select('contact_id').eq('id', conversationId).maybeSingle();
      if (!conv?.contact_id) { toast.error('Conversation not found'); return; }
      const ok = await sendWhatsAppTemplate(conversationId, conv.contact_id, tpl, {}, user?.id);
      if (ok) onSent();
      else toast.error('Failed to send template');
    } finally {
      setSendingId(null);
    }
  };

  const handleClick = async (tpl: TemplateRecord) => {
    const bodyComp = (tpl.components || []).find((c: any) => (c.type || '').toUpperCase() === 'BODY');
    const headerComp = (tpl.components || []).find((c: any) => (c.type || '').toUpperCase() === 'HEADER');
    const bodyParams = extractPlaceholders(bodyComp?.text || '');
    const headerParams = extractPlaceholders(headerComp?.text || '');
    if (bodyParams > 0 || headerParams > 0) {
      const { data: conv } = await supabase.from('conversations').select('contact_id').eq('id', conversationId).maybeSingle();
      if (!conv?.contact_id) { toast.error('Conversation not found'); return; }
      setParamModal({ template: tpl, contactId: conv.contact_id });
    } else {
      sendDirect(tpl);
    }
  };

  const handleManualSync = async () => {
    if (!project || syncing) return;
    setSyncing(true);
    const changed = await syncTemplatesFromMeta(project);
    setSyncing(false);
    if (changed) {
      setSyncToken((t) => t + 1);
      toast.success('New templates synced from Meta');
    } else {
      toast.info('Templates are up to date');
    }
  };

  const handleParamSend = async (paramValues: Record<string, string>) => {
    if (!paramModal) return;
    setSendingId(paramModal.template.id);
    try {
      const ok = await sendWhatsAppTemplate(conversationId, paramModal.contactId, paramModal.template, paramValues, user?.id);
      if (ok) onSent();
      else toast.error('Failed to send template');
    } finally {
      setSendingId(null);
    }
  };

  if (isLoading) return null;
  if (!templates || templates.length === 0) return null;

  return (
    <>
      <div className="border-t border-[#e9edef] bg-[#f0f2f5]">
        <div className="flex flex-wrap gap-1.5 px-2 py-1 items-center">
          {templates.map((tpl) => (
            <Button
              key={tpl.id}
              variant="outline"
              size="sm"
              onClick={() => handleClick(tpl)}
              disabled={sendingId === tpl.id || tpl.status === 'pending'}
              className={`text-xs bg-white border-[#d1d7db] hover:bg-[#e9edef] ${tpl.status === 'pending' ? 'opacity-60' : ''}`}
              title={tpl.status === 'pending' ? 'Pending Meta approval' : tpl.name}
            >
              {sendingId === tpl.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LayoutTemplate className={`h-3.5 w-3.5 mr-1 ${tpl.status === 'pending' ? 'text-[#f5a623]' : 'text-[#00a884]'}`} />
              )}
              {tpl.name}
              {tpl.status === 'pending' && (
                <span className="ml-1.5 text-[9px] text-[#f5a623] font-medium">PENDING</span>
              )}
            </Button>
          ))}
          <button
            onClick={handleManualSync}
            disabled={syncing}
            title="Sync templates from Meta"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded hover:bg-[#d1d7db] text-[#667781]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      {paramModal && (
        <TemplateParamsModal
          template={paramModal.template}
          onSend={handleParamSend}
          onClose={() => setParamModal(null)}
        />
      )}
    </>
  );
}
