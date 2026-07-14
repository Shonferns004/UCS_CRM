import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Loader2, Check, CheckCheck, XCircle, MessageSquare, Search, Plus, X, Send } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import type { Message, WhatsAppPhoneNumber } from 'shared';
import { ConversationLabels, LabelFilter } from '../components/chat/ConversationLabels';
import { MessageSearchModal } from '../components/chat/MessageSearch';
import { MessageComposer } from '../components/chat/MessageComposer';
import { sendWhatsAppMessage } from '../lib/whatsapp';
import { QuickReplyBar } from '../components/chat/QuickReplyBar';
import { MediaPreview, MediaFromMeta } from '../components/chat/MediaPreview';

function MessageStatusIcon({ status }: { status: string }) {
  if (status === 'sent') return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-blue-500" />;
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  if (status === 'queued') return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  return null;
}

export function InboxPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const [newConvPhone, setNewConvPhone] = useState('');
  const [newConvContactId, setNewConvContactId] = useState<string | null>(null);
  const [newConvMessage, setNewConvMessage] = useState('');
  const [newConvPhoneId, setNewConvPhoneId] = useState('');
  const [creatingConv, setCreatingConv] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations, isLoading: loadingConvs } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*, contact:contacts(*)')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      const seen = new Map<string, any>();
      for (const c of data || []) {
        const key = c.contact_id;
        if (!seen.has(key) || new Date(c.last_message_at) > new Date(seen.get(key).last_message_at)) {
          seen.set(key, c);
        }
      }
      return Array.from(seen.values());
    },
    refetchInterval: 10000,
  });

  const { data: messages, isLoading: loadingMsgs } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data: conv } = await supabase.from('conversations').select('contact_id').eq('id', conversationId).maybeSingle();
      if (!conv?.contact_id) return [];
      const { data: allConvs } = await supabase.from('conversations').select('id').eq('contact_id', conv.contact_id);
      const ids = (allConvs || []).map((c: any) => c.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', ids)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversationId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`conversation-new:${user?.tenant_id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversations',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.tenant_id, conversationId, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const { data: contacts } = useQuery({
    queryKey: ['contacts-list'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, wa_profile_name, phone, source').order('created_at', { ascending: false }).limit(100);
      return (data || []).map((c: any) => ({ ...c, first_name: c.wa_profile_name || c.phone, last_name: '' }));
    },
  });

  const { data: phoneNumbers } = useQuery<WhatsAppPhoneNumber[]>({
    queryKey: ['whatsapp-phone-numbers'],
    queryFn: async () => {
      const { data } = await supabase.from('whatsapp_accounts').select('*').order('is_default', { ascending: false });
      return (data || []).map((a: any) => ({ id: a.id, phone_number_id: a.phone_number_id, display_phone_number: a.phone_number_id, label: a.name, is_primary: a.is_default, status: a.is_active ? 'active' : 'inactive', tenant_id: '', verified_name: a.name, quality_rating: '', created_at: a.created_at })) as WhatsAppPhoneNumber[];
    },
  });

  const handleStartConversation = async () => {
    const phone = newConvPhone.trim();
    if (!phone) { toast.error('Enter a phone number'); return; }
    if (!newConvPhoneId) { toast.error('Select a WhatsApp number to send from'); return; }
    setCreatingConv(true);
    try {
      const token = localStorage.getItem('ucs_token');
      if (!token) {
        toast.error('Not authenticated');
        setCreatingConv(false);
        return;
      }

      let contactId = newConvContactId;
      if (!contactId) {
        const phoneNormalized = phone.replace(/[^0-9]/g, '');
        const { data: existing } = await supabase.from('contacts').select('id').eq('phone_normalized', phoneNormalized).maybeSingle();
        if (existing) {
          contactId = existing.id;
        } else {
          const { data: newContact, error: createError } = await supabase.from('contacts').insert({
            tenant_id: user?.tenant_id,
            phone,
            phone_normalized: phoneNormalized,
            source: 'manual',
          }).select().single();
          if (createError) throw createError;
          contactId = newContact.id;
        }
      }

      const { data: pn } = await supabase.from('whatsapp_accounts').select('*').eq('id', newConvPhoneId).single();
      if (!pn) { toast.error('Phone number not found'); return; }

      const { data: conversation, error: convError } = await supabase.from('conversations').insert({
        tenant_id: user?.tenant_id,
        contact_id: contactId,
        phone_number_id: pn.id,
        status: 'open',
        source: 'manual',
        last_message_at: new Date().toISOString(),
      }).select('*, contact:contacts(*)').single();
      if (convError) throw convError;

      if (newConvMessage.trim()) {
        sendWhatsAppMessage(conversation.id, contactId, newConvMessage.trim());
      }

      setShowNewConv(false);
      setNewConvPhone('');
      setNewConvContactId(null);
      setNewConvMessage('');
      setNewConvPhoneId('');
      navigate(`/inbox/${conversation.id}`);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to start conversation');
    } finally {
      setCreatingConv(false);
    }
  };

  const selectedConversation = conversations?.find((c) => c.id === conversationId);

  const isAgent = user?.role === 'agent';
  const avatarLetter = (name?: string) => (name?.[0] || '?').toUpperCase();

  return (<>
    <div className={`flex ${isAgent ? 'h-screen w-full' : 'h-[calc(100vh-12rem)]'}`}>
      {/* Conversation List */}
      <div className="w-80 border-r bg-white flex-shrink-0 flex flex-col">
        <div className="bg-[#075e54] text-white px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-sm">Chats</span>
          <div className="flex gap-2">
            <button onClick={() => setSearchOpen(true)} className="text-white/80 hover:text-white"><Search className="h-4 w-4" /></button>
            {!isAgent && <button onClick={() => setShowNewConv(true)} className="text-white/80 hover:text-white"><Plus className="h-4 w-4" /></button>}
          </div>
        </div>
        <div className="relative px-3 py-2 bg-white border-b">
          <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-7 text-xs rounded-lg bg-[#f0f2f5] border-0"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 border-b px-4 py-3">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 rounded bg-muted" />
                  <div className="h-2 w-24 rounded bg-muted" />
                </div>
              </div>
            ))
          ) : conversations?.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => navigate(`/inbox/${conversation.id}`)}
              className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-[#f0f2f5] ${
                conversation.id === conversationId ? 'bg-[#f0f2f5]' : ''
              }`}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#075e54] text-sm font-semibold text-white">
                {avatarLetter(conversation.contact?.wa_profile_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium">
                    {conversation.contact?.wa_profile_name || conversation.contact?.phone}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {conversation.last_message_at ? format(new Date(conversation.last_message_at), 'HH:mm') : ''}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{conversation.contact?.phone}</p>
              </div>
            </button>
          )) || (
            <div className="flex flex-col items-center gap-2 p-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs">Messages will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex flex-1 flex-col bg-[#efeae2]">
        {selectedConversation ? (
          <>
            <div className="bg-[#075e54] px-4 py-3 text-white flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
                {avatarLetter(selectedConversation.contact?.wa_profile_name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{selectedConversation.contact?.wa_profile_name || selectedConversation.contact?.phone}</p>
                <p className="text-[11px] text-white/70">{selectedConversation.contact?.phone}</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d9d9d9\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
              {loadingMsgs ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                      <div className={`animate-pulse rounded-lg p-3 ${i % 2 === 0 ? 'bg-white' : 'bg-[#dcf8c6]'}`}>
                        <div className={`h-4 rounded ${i % 2 === 0 ? 'w-48' : 'w-32'} bg-gray-200`} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {messages?.map((message) => (
                    <div key={message.id} className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[65%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                        message.direction === 'outbound'
                          ? 'bg-[#dcf8c6] rounded-br-none'
                          : 'bg-white rounded-bl-none'
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{message.body_text || (message.media_url ? '[Media]' : '')}</p>
                        {message.media_url ? (
                          <MediaPreview url={message.media_url} mimeType={message.media_mime_type} className="mt-1" />
                        ) : message.media_id ? (
                          <MediaFromMeta mediaId={message.media_id} mimeType={message.media_mime_type} />
                        ) : null}
                        <div className="mt-1 flex items-center justify-end gap-1">
                          <span className="text-[10px] text-gray-500">
                            {format(new Date(message.created_at), 'HH:mm')}
                          </span>
                          {message.direction === 'outbound' && <MessageStatusIcon status={message.status} />}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
              {(!messages || messages.length === 0) && !loadingMsgs && (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <p className="text-sm">No messages yet</p>
                </div>
              )}
            </div>
            <QuickReplyBar conversationId={selectedConversation.id} onSent={() => { queryClient.invalidateQueries({ queryKey: ['messages', conversationId] }); queryClient.invalidateQueries({ queryKey: ['conversations'] }); }} />
            <MessageComposer conversationId={selectedConversation.id} tenantId={selectedConversation.tenant_id} contactId={selectedConversation.contact_id} userId={user?.id || ''} onMessageSent={() => { queryClient.invalidateQueries({ queryKey: ['messages', conversationId] }); queryClient.invalidateQueries({ queryKey: ['conversations'] }); }} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground bg-[#f0f2f5]">
            <MessageSquare className="h-16 w-16 opacity-30" />
            <p className="text-lg font-medium">WhatsApp CRM</p>
            <p className="text-sm">Select a chat or start a new conversation</p>
          </div>
        )}
      </div>
    </div>

    <MessageSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

    {showNewConv && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNewConv(false)}>
        <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">New Conversation</h2>
            <Button variant="ghost" size="icon" onClick={() => setShowNewConv(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Contact</Label>
              <Input placeholder="Search or enter phone number..." value={newConvPhone} onChange={(e) => { setNewConvPhone(e.target.value); setNewConvContactId(null); }} />
              {newConvPhone.length > 2 && !newConvContactId && (
                <div className="max-h-32 overflow-y-auto rounded border text-sm">
                  {contacts?.filter((c) => c.phone?.includes(newConvPhone) || (c.wa_profile_name || '').toLowerCase().includes(newConvPhone.toLowerCase())).slice(0, 5).map((c) => (
                    <button key={c.id} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-accent text-left" onClick={() => { setNewConvPhone(c.phone); setNewConvContactId(c.id); }}>
                      <span className="font-medium">{c.wa_profile_name || c.phone}</span>
                      <span className="text-muted-foreground">{c.phone}</span>
                    </button>
                  )) || null}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Send From</Label>
              <select value={newConvPhoneId} onChange={(e) => setNewConvPhoneId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select a number...</option>
                {phoneNumbers?.map((pn) => (<option key={pn.id} value={pn.id}>{(pn as any).label || pn.display_phone_number} ({pn.display_phone_number})</option>))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Initial Message (optional)</Label>
              <textarea value={newConvMessage} onChange={(e) => setNewConvMessage(e.target.value)} placeholder="Type your first message..." className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <Button className="w-full" onClick={handleStartConversation} disabled={creatingConv}>
              {creatingConv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Start Conversation
            </Button>
          </div>
        </div>
      </div>
    )}
  </>);
}
