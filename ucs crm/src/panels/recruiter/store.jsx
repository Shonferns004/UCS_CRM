import { createContext, useContext, useCallback, useState, useMemo, useEffect, useRef } from 'react'
import { useUcs } from '../../store'
import { api } from '../../api/auth'
import { useRealtime } from '../../hooks/useRealtime'

const RecContext = createContext(null)
export const useRec = () => useContext(RecContext)

const PALETTE = ['#5B6B4E','#B5603A','#C08A2E','#4F6472','#7A5C7E','#88693D']
export const avatarColor = (name) => { let h=0; for(const c of name) h=c.charCodeAt(0)+((h<<5)-h); return PALETTE[Math.abs(h)%PALETTE.length] }
export const initials = (n) => n.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()
export const avatarTint = (hex) => hex + '22'

const now = () => new Date().toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
export const STAGES = ['Contacted','Screening','Interview Scheduled','Selected','Offer Sent','Rejected']
export const LEAD_SOURCES = ['Walk-in','LinkedIn','Referral','Job Portal','Other']
export const LEAD_STATUSES = [
  { value:'hold', label:'Hold' },
  { value:'followed_up', label:'Followed Up' },
  { value:'call_back', label:'Call Back' },
  { value:'scheduled', label:'Scheduled' },
  { value:'not_interested', label:'Not Interested' },
  { value:'ringing', label:'Ringing' },
  { value:'unreachable', label:'Unreachable' },
  { value:'busy', label:'Busy' },
  { value:'switched_off', label:'Switched Off' },
  { value:'wrong_number', label:'Wrong Number' },
  { value:'invalid', label:'Invalid' },
  { value:'rejected', label:'Rejected' },
]
export const NOT_CONNECTED_OPTIONS = [
  { value:'ringing', label:'Ringing' },
  { value:'unreachable', label:'Unreachable' },
  { value:'busy', label:'Busy' },
  { value:'switched_off', label:'Switched Off' },
  { value:'wrong_number', label:'Wrong Number' },
  { value:'invalid', label:'Invalid' },
  { value:'rejected', label:'Rejected' },
]

export const getJobRole = (lead) => {
  if (lead.job_role) return lead.job_role;
  let notes = [];
  try { notes = JSON.parse(lead.notes || '[]'); } catch (e) {}
  const meta = notes.find(n => n.__meta === true && n.type === 'job_role');
  return meta ? meta.value : '';
}

export const CANDIDATE_STAGES = [
  'New','Contacted','Screening','Shortlisted','Interview Scheduled','Interviewed',
  'Selected','Offer Released','Offer Accepted','Onboarding',
  'Rejected','On Hold','Withdrawn',
]

export const CANDIDATE_SOURCES = ['Job Portal','LinkedIn','Referral','Walk-in','Website','Agency','Other']

export const STAGE_TO_STATUS = {
  'New': 'new',
  'Contacted': 'contacted',
  'Screening': 'screening',
  'Shortlisted': 'shortlisted',
  'Interview Scheduled': 'scheduled',
  'Interviewed': 'interviewed',
  'Selected': 'selected',
  'Offer Released': 'offer_released',
  'Offer Accepted': 'offer_accepted',
  'Onboarding': 'onboarding',
  'Rejected': 'rejected',
  'On Hold': 'on_hold',
  'Withdrawn': 'withdrawn',
}

export const STATUS_TO_STAGE = {
  new: 'New',
  contacted: 'Contacted',
  screening: 'Screening',
  shortlisted: 'Shortlisted',
  scheduled: 'Interview Scheduled',
  interviewed: 'Interviewed',
  selected: 'Selected',
  offer_released: 'Offer Released',
  offer_accepted: 'Offer Accepted',
  onboarding: 'Onboarding',
  rejected: 'Rejected',
  on_hold: 'On Hold',
  withdrawn: 'Withdrawn',
  hold: 'Screening',
  followed_up: 'Contacted',
  call_back: 'Contacted',
  not_interested: 'Rejected',
  joined: 'Selected',
  ringing: 'Contacted',
  unreachable: 'Contacted',
  busy: 'Contacted',
  switched_off: 'Contacted',
  wrong_number: 'Contacted',
  invalid: 'Contacted',
}

export const EXPERIENCE_BUCKETS = [
  { label: '0–1 Years', min: 0, max: 1 },
  { label: '1–3 Years', min: 1, max: 3 },
  { label: '3–5 Years', min: 3, max: 5 },
  { label: '5–10 Years', min: 5, max: 10 },
  { label: '10+ Years', min: 10, max: Infinity },
]

export const experienceYears = (v) => {
  if (v == null || v === '') return null
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}

export const parseNotes = (lead) => {
  if (!lead) return []
  try { const a = JSON.parse(lead.notes || '[]'); return Array.isArray(a) ? a : [] } catch (e) { return lead.notes ? [{ text: String(lead.notes) }] : [] }
}

export const getMetaNote = (notes, type) => (notes || []).find(n => n && n.__meta === true && n.type === type)

export const getCandidateProfile = (lead) => {
  const m = getMetaNote(parseNotes(lead), 'candidate')
  return (m && m.value && typeof m.value === 'object') ? m.value : {}
}

export const getCandidateActivities = (lead) => {
  const m = getMetaNote(parseNotes(lead), 'activities')
  return (m && Array.isArray(m.value)) ? m.value : []
}

export const getCandidateInterviews = (lead) => {
  const m = getMetaNote(parseNotes(lead), 'interviews')
  return (m && Array.isArray(m.value)) ? m.value : []
}

export const getCandidateEmail = (lead) => (lead && (lead.email || getCandidateProfile(lead).email)) || ''

export const buildCandidateNotes = ({ lead, profile, activities, interviews }) => {
  const notes = parseNotes(lead)
  const kept = notes.filter(n => !n || !n.__meta || (n.type !== 'candidate' && n.type !== 'activities' && n.type !== 'interviews' && n.type !== 'job_role'))
  const meta = []
  const role = profile && profile.appliedJob
  if (role) meta.push({ __meta: true, type: 'job_role', value: role })
  if (profile) meta.push({ __meta: true, type: 'candidate', value: profile })
  if (activities && activities.length) meta.push({ __meta: true, type: 'activities', value: activities })
  const iv = interviews !== undefined ? interviews : getCandidateInterviews(lead)
  if (iv && iv.length) meta.push({ __meta: true, type: 'interviews', value: iv })
  return [...kept, ...meta]
}

let _id = 100
const nid = () => ++_id

export function RecProvider({ children }) {
  const { token, user } = useUcs()

  const [jobs, setJobs] = useState([])
  const [feed, setFeed] = useState([{ id:0, msg:'Recruiter workspace ready', time: now() }])
  const log = useCallback((msg)=>setFeed(f=>[{id:nid(),msg,time:now()},...f].slice(0,8)),[])

  const addJob = (j) => { setJobs(p => [...p, { ...j, id:nid(), applicants:0, status:'Open' }]); log(`Opened role \u00B7 ${j.title}`) }

  const [leads, setLeads] = useState([])
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [leadFilters, setLeadFilters] = useState({ search: '', status: '', source: '' })
  const createdLeadsRef = useRef({})

  const candidates = useMemo(() => leads.map(l => {
    const profile = getCandidateProfile(l)
    const expYears = experienceYears(profile.experience)
    return {
      id: l.id,
      leadId: l.id,
      name: l.name || '—',
      phone: l.phone || '—',
      email: l.email || profile.email || '—',
      role: getJobRole(l),
      stage: STATUS_TO_STAGE[l.status] || 'Contacted',
      status: l.status || '',
      score: 0,
      source: l.source || '—',
      skills: Array.isArray(profile.skills) ? profile.skills : [],
      exp: profile.experience || '—',
      experienceYears: expYears,
      location: profile.location || '—',
      salary: profile.expectedSalary || profile.currentSalary || '—',
      dob: l.dob || null,
      age: l.age || null,
      createdByName: l.created_by_name || '—',
      createdAt: l.created_at || null,
      profile,
      activities: getCandidateActivities(l),
      interviews: getCandidateInterviews(l),
      _raw: l,
    }
  }), [leads])

  const fetchLeads = useCallback(async (silent) => {
    if (!token) return
    if (!silent) setLeadsLoading(true)
    try {
      const params = new URLSearchParams()
      if (leadFilters.search) params.set('search', leadFilters.search)
      if (leadFilters.status) params.set('status', leadFilters.status)
      if (leadFilters.source) params.set('source', leadFilters.source)
      const qs = params.toString()
      const data = await api('/leads' + (qs ? '?' + qs : ''), { _prefix: 'ucs' })
      const ids = new Set((data || []).map(d => d.id))
      const extras = Object.values(createdLeadsRef.current).filter(l => !ids.has(l.id))
      setLeads([...extras, ...data])
    } catch (e) { console.error('Error:', e.message); } finally { setLeadsLoading(false) }
  }, [token, leadFilters])

  const refreshLeads = useCallback(() => fetchLeads(false), [fetchLeads])

  useEffect(() => {
    if (!token) return
    fetchLeads(true)
  }, [token, fetchLeads])

  useRealtime('leads', {
    event: '*',
    onInsert: () => fetchLeads(true),
    onUpdate: () => fetchLeads(true),
    onDelete: () => fetchLeads(true),
  })

  const addLead = useCallback(async (data) => {
    const temp = { ...data, id: -Date.now(), created_at: new Date().toISOString() }
    setLeads(p => [temp, ...p])
    try {
      const res = await api('/leads', { method: 'POST', body: JSON.stringify(data), _prefix: 'ucs' })
      const realLead = res.lead || res
      const realId = realLead.id || res.id
      const merged = { ...realLead, ...data, id: realId }
      createdLeadsRef.current[realId] = merged
      setLeads(p => {
        const withoutTemp = p.filter(l => l.id !== temp.id && l.id !== realId)
        return [merged, ...withoutTemp]
      })
    } catch (err) {
      console.error('addLead failed:', err?.message || err)
      setLeads(p => p.filter(l => l.id !== temp.id))
      alert(err?.message || 'Failed to create lead')
    }
    log(`Lead created — ${data.name}`)
  }, [log])

  const updateLead = useCallback(async (id, data) => {
    await api('/leads/' + id, { method: 'PUT', body: JSON.stringify(data), _prefix: 'ucs' })
    if (createdLeadsRef.current[id]) createdLeadsRef.current[id] = { ...createdLeadsRef.current[id], ...data }
    await fetchLeads(true)
    log(`Lead updated \u2014 ${id}`)
  }, [fetchLeads, log])

  const deleteLead = useCallback(async (id) => {
    try {
      const res = await api('/leads/' + id, { method: 'DELETE', _prefix: 'ucs', raw: true })
      if (!res.ok) throw new Error('Failed to delete lead')
    } catch (e) {
      const leadId = String(id).trim()
      if (!leadId) throw e
      const apiBase = import.meta.env.VITE_API_URL || 'https://api.beingsevak.org/api'
      const res = await fetch(`${apiBase}/db/rows/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'leads', rows: [{ id: leadId }] }),
      })
      if (!res.ok) throw new Error('Failed to delete lead')
    }
    delete createdLeadsRef.current[id]
    setLeads(p => p.filter(l => l.id !== id))
    log(`Lead deleted \u2014 ${id}`)
  }, [log])

  const [leadStats, setLeadStats] = useState({ leads:0, today:0, onHold:0, conversion:0 })
  const fetchLeadStats = useCallback(async () => {
    if (!token) return
    try {
      const data = await api('/leads/dashboard', { _prefix: 'ucs' })
      if (data) setLeadStats(data)
    } catch (e) { console.error('Error:', e.message); }
  }, [token])

  useEffect(() => { if (token) fetchLeadStats() }, [token, fetchLeadStats])

  const updateLeadFilters = useCallback((filters) => {
    setLeadFilters(prev => ({ ...prev, ...filters }))
  }, [])

  const value = useMemo(() => ({
    candidates, jobs, feed, log,
    addJob,
    leads, leadsLoading, leadFilters, setLeadFilters, leadStats,
    fetchLeads, refreshLeads, addLead, updateLead, deleteLead, fetchLeadStats, updateLeadFilters,
    currentUser: user, user, STAGES,
  }), [candidates, jobs, feed, leads, leadsLoading, leadFilters, setLeadFilters, leadStats, user, STAGES])

  return <RecContext.Provider value={value}>{children}</RecContext.Provider>
}
