import { supabase } from '../lib/supabase'
import { api } from './auth'

function isWithin24Hours(dateStr) {
  if (!dateStr) return false
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000
}

export async function getConversations(userId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*, contact:contacts(*)')
    .eq('assigned_agent_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (error) throw error

  const seen = new Map()
  for (const c of data || []) {
    const key = c.contact_id
    if (!seen.has(key) || new Date(c.last_message_at) > new Date(seen.get(key).last_message_at)) {
      seen.set(key, c)
    }
  }
  return Array.from(seen.values())
}

export async function getUnreadCount(userId) {
  const conversations = await getConversations(userId)
  return conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)
}

export async function getMessages(conversationId) {
  const { data: conv } = await supabase
    .from('conversations')
    .select('contact_id, project')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv?.contact_id) return []

  let q = supabase.from('conversations').select('id').eq('contact_id', conv.contact_id)
  if (conv.project) q = q.eq('project', conv.project)

  const { data: allConvs } = await q
  const ids = (allConvs || []).map(c => c.id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', ids)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function markRead(conversationId) {
  await supabase.from('conversations').update({ unread_count: 0 }).eq('id', conversationId)
}

export async function sendMessage(conversationId, contactId, messageText, userId, mediaUrl, mediaType, mediaFile) {
  const { data: conv } = await supabase
    .from('conversations')
    .select('last_inbound_at, last_message_at, project')
    .eq('id', conversationId)
    .maybeSingle()

  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_normalized')
    .eq('id', contactId)
    .maybeSingle()

  if (!contact?.phone_normalized) throw new Error('Contact phone not found')

  const windowOpen = isWithin24Hours(conv?.last_inbound_at || conv?.last_message_at)
  const isMedia = !!mediaUrl
  const mime = mediaType || ''
  const msgType = isMedia ? (mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document') : 'text'

  const isMulti = messageText === '__MULTI__'
  let extraFiles = null
  if (isMulti && mediaUrl) {
    const parts = mediaUrl.includes(',') ? mediaUrl.split(',') : [mediaUrl]
    const first = parts[0].split('|||')
    mediaUrl = first[0]
    extraFiles = parts.slice(1).map(u => {
      const [url, type, name] = u.split('|||')
      return { url, type, name }
    })
  }

  const { data: msg, error: msgErr } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      contact_id: contactId,
      user_id: userId || null,
      direction: 'outbound',
      message_type: msgType,
      body_text: isMedia && !isMulti ? '' : (isMulti ? '' : messageText),
      media_url: mediaUrl || null,
      media_mime_type: mediaFile?.type || null,
      ...(extraFiles ? { template_params: extraFiles } : {}),
      status: 'queued',
    })
    .select()
    .single()

  if (msgErr) throw msgErr

  const accounts = []
  const { data: assignments } = await supabase
    .from('agent_phone_assignments')
    .select('account_id')
    .eq('user_id', userId)

  if (assignments && assignments.length > 0) {
    const ids = assignments.map(a => a.account_id)
    const { data } = await supabase
      .from('whatsapp_accounts')
      .select('phone_number_id, access_token, project')
      .in('id', ids)
    if (data) accounts.push(...data)
  }

  if (accounts.length === 0) {
    const { data } = await supabase
      .from('whatsapp_accounts')
      .select('phone_number_id, access_token, project')
    if (data) accounts.push(...data)
  }

  const convProject = conv?.project || ''
  if (convProject) {
    const matchIdx = accounts.findIndex(a => a.project === convProject)
    if (matchIdx > 0) {
      const match = accounts.splice(matchIdx, 1)[0]
      accounts.unshift(match)
    }
  }

  async function uploadToMeta(accessToken, phoneNumberId) {
    if (!mediaFile) return null
    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('file', mediaFile, mediaFile.name)
    form.append('type', mediaFile.type)
    try {
      const r = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      })
      const d = await r.json()
      return d.id || null
    } catch { return null }
  }

  function mediaPayload(metaMediaId) {
    const body = { messaging_product: 'whatsapp', to: contact.phone_normalized }
    if (metaMediaId) {
      if (msgType === 'image') {
        body.type = 'image'; body.image = { id: metaMediaId }
      } else if (msgType === 'video') {
        body.type = 'video'; body.video = { id: metaMediaId }
      } else if (msgType === 'audio') {
        body.type = 'audio'; body.audio = { id: metaMediaId }
      } else {
        body.type = 'document'; body.document = { id: metaMediaId, caption: messageText || '' }
      }
    } else {
      if (msgType === 'image') {
        body.type = 'image'; body.image = { link: mediaUrl }
      } else if (msgType === 'video') {
        body.type = 'video'; body.video = { link: mediaUrl }
      } else if (msgType === 'audio') {
        body.type = 'audio'; body.audio = { link: mediaUrl }
      } else {
        body.type = 'document'; body.document = { link: mediaUrl, caption: messageText || '' }
      }
    }
    return body
  }

  const metaApi = 'https://graph.facebook.com/v23.0'

  let metaMediaId = null
  if (isMedia && mediaFile && accounts.length > 0) {
    metaMediaId = await uploadToMeta(accounts[0].access_token, accounts[0].phone_number_id)
  }

  for (const acct of accounts) {
    const buildPayloads = () => {
      const list = []
      if (!windowOpen) {
        list.push({
          messaging_product: 'whatsapp',
          to: contact.phone_normalized,
          type: 'template',
          template: { name: 'hello_world', language: { code: 'en_US' } },
        })
      }
      list.push(isMedia ? mediaPayload(metaMediaId) : {
        messaging_product: 'whatsapp',
        to: contact.phone_normalized,
        type: 'text',
        text: { body: messageText },
      })
      return list
    }
    for (const payload of buildPayloads()) {
      try {
        const res = await fetch(`${metaApi}/${acct.phone_number_id}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${acct.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
        const result = await res.json()
        if (res.ok && result.messages?.[0]?.id) {
          const updates = {
            status: 'sent',
            wa_message_id: result.messages[0].id,
            status_updated_at: new Date().toISOString(),
          }
          if (metaMediaId) updates.media_id = metaMediaId
          await supabase
            .from('messages')
            .update(updates)
            .eq('id', msg.id)
          await supabase
            .from('conversations')
            .update({ assigned_agent_id: userId, last_message_at: new Date().toISOString() })
            .eq('id', conversationId)
            .is('assigned_agent_id', null)
          return msg
        }
      } catch (e) {
        console.error('Meta send failed:', e)
      }
    }
  }

  await supabase
    .from('messages')
    .update({ status: 'failed', failure_reason: 'All accounts failed' })
    .eq('id', msg.id)

  throw new Error('Failed to send message')
}

export async function sendDirectMessage(userId, phone, messageText, project) {
  const phoneNormalized = String(phone).replace(/[^0-9]/g, '')

  let { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle()

  if (!contact) {
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert({ phone, phone_normalized: phoneNormalized, source: 'manual' })
      .select()
      .single()
    if (error) throw error
    contact = newContact
  }

  const { data: existingConv } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', contact.id)
    .eq('status', 'open')
    .maybeSingle()

  let conversation = existingConv
  if (!conversation) {
    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        contact_id: contact.id,
        status: 'open',
        assigned_agent_id: userId,
        project: project || null,
        last_message_at: new Date().toISOString(),
      })
      .select('*, contact:contacts(*)')
      .single()
    if (error) throw error
    conversation = newConv
  }

  await sendMessage(conversation.id, contact.id, messageText, userId)

  const { data: fullConv } = await supabase
    .from('conversations')
    .select('*, contact:contacts(*)')
    .eq('id', conversation.id)
    .single()

  return { conversation: fullConv }
}

export async function getQuickReplies() {
  const { data } = await supabase
    .from('quick_replies')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return data || []
}

export async function getTemplates(project) {
  let query = supabase
    .from('whatsapp_templates')
    .select('*')
    .in('status', ['approved', 'APPROVED'])
    .order('name', { ascending: true })
  if (project) query = query.eq('project', project)
  const { data } = await query
  return data || []
}

export async function sendTemplateMessage(conversationId, contactId, template, paramValues, userId) {
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_normalized')
    .eq('id', contactId)
    .maybeSingle()

  if (!contact?.phone_normalized) throw new Error('Contact phone not found')

  const msgId = crypto.randomUUID()

  await supabase.from('messages').insert({
    id: msgId,
    conversation_id: conversationId,
    contact_id: contactId,
    user_id: userId,
    direction: 'outbound',
    message_type: 'template',
    body_text: template.name,
    template_id: String(template.id),
    template_params: paramValues,
    status: 'queued',
    message_category: 'service',
  })

  const accounts = []
  const { data: assignments } = await supabase
    .from('agent_phone_assignments')
    .select('account_id')
    .eq('user_id', userId)

  if (assignments && assignments.length > 0) {
    const ids = assignments.map(a => a.account_id)
    const { data } = await supabase
      .from('whatsapp_accounts')
      .select('phone_number_id, access_token, waba_id')
      .in('id', ids)
    if (data) accounts.push(...data)
  }

  if (accounts.length === 0) {
    const { data } = await supabase
      .from('whatsapp_accounts')
      .select('phone_number_id, access_token, waba_id')
    if (data) accounts.push(...data)
  }

  const paramArray = Array.isArray(paramValues) ? paramValues : Object.values(paramValues || {})
  const components = template.components?.length
    ? template.components
        .filter(c => c.type !== 'BUTTON')
        .map(c => {
          const text = c.text || ''
          const match = text.match(/\{\{(\d+)\}\}/g)
          if (!match) return null
          const params = match.map((m, i) => ({
            type: 'text',
            text: paramArray[i] || '',
          }))
          return params.length > 0 ? { type: c.type, parameters: params } : null
        })
        .filter(Boolean)
    : []

  const metaApi = 'https://graph.facebook.com/v23.0'

  for (const acct of accounts) {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        to: contact.phone_normalized,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language || 'en' },
        },
      }
      if (components.length > 0) payload.template.components = components

      const res = await fetch(`${metaApi}/${acct.phone_number_id}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${acct.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const result = await res.json()

      if (res.ok && result.messages?.[0]?.id) {
        await supabase
          .from('messages')
          .update({
            status: 'sent',
            wa_message_id: result.messages[0].id,
            status_updated_at: new Date().toISOString(),
          })
          .eq('id', msgId)
        return true
      }
    } catch (e) {
      console.error('Template send failed:', e)
    }
  }

  await supabase
    .from('messages')
    .update({ status: 'failed', failure_reason: 'Template send failed' })
    .eq('id', msgId)

  throw new Error('Failed to send template')
}

export async function searchMessages(userId, query) {
  const conversations = await getConversations(userId)
  const convIds = conversations.map(c => c.id)
  if (convIds.length === 0) return []

  const { data } = await supabase
    .from('messages')
    .select('*, contact:contacts!inner(id, phone, phone_normalized, wa_profile_name, project)')
    .in('conversation_id', convIds)
    .ilike('body_text', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50)

  return data || []
}

export async function updateLabels(conversationId, labels) {
  await supabase.from('conversations').update({ labels }).eq('id', conversationId)
}

export async function uploadMedia(userId, file) {
  const formData = new FormData()
  formData.append('file', file)
  try {
    const res = await fetch((import.meta.env.VITE_API_URL || 'https://ucs-crm-backend.vercel.app/api') + '/upload', {
      method: 'POST', body: formData,
    })
    if (res.ok) return res.json()
  } catch (e) { console.error('Error:', e.message); }
  return api('/fro/whatsapp/upload-media', { method: 'POST', body: formData })
}
