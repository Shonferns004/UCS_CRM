import { useState, useEffect, useCallback, useRef } from 'react';
import { getMyDonors, getMyStations, getDonorDetail, addDonorLog, markDonorSeen, uploadPaymentScreenshot, getDonorDonations, searchDonorsByMobile, updateDonorType } from '../api/donors';
import { api, isImpersonating, getUser } from '../../../api/auth';
import { SkeletonProfile } from '../../../components/Skeleton';
import { toast } from '../../../components/Toast';
import { useRealtime } from '../../../hooks/useRealtime';
import { DatePicker } from '../components/ui';
import { TimePicker } from '../components/TimePicker';
import { DispositionDropdown } from '../components/DispositionDropdown';
import { useCall } from '../CallContext';
import { extractTransactionData } from '../utils/ocr';
import { API_BASE } from '../../../lib/apiBase';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { NOT_CONNECTED, CONNECTED, isConnected, findDisp, STATUS_PILL_MAP, SCHEDULE_DATE_TYPES, SCHEDULE_TIME_TYPES, NOT_CONNECTED_IDS } from '../dispositions';
import { istDateString, istDateTimeToIso } from '../utils/time';

function callFmt(seconds) {
  if (seconds == null) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const PROJECTS = [
  'Mission Annapurna', 'Mission Vidhya', 'Mission Aurat', 'Mission Bezubaan',
  'Mission Atmanirbhar', 'Mission Arogya', 'Sevak Seva Kendra', 'Mission Eco-Warriors',
];
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const DISP_TO_STATUS = { office_visit_scheduled: 'scheduled', program_visit_scheduled: 'scheduled' };

const isCollectionLog = (log) =>
  log.action === 'donation' ||
  log.disposition_detail === 'done' ||
  (log.disposition_detail === 'lead_done' && log.accounts_status === 'verified');

const RETRYABLE_NOT_CONNECTED = new Set([
  'ringing', 'unreachable', 'busy', 'out_of_coverage', 'voicemail', 'call_waiting', 'switched_off',
]);
const HIDDEN_STATUSES = new Set([
  'lead_done', 'donation_collected', 'done',
  'scheduled', 'callback', 'follow_up', 'office_visit_scheduled', 'program_visit_scheduled',
  'wrong_number', 'invalid_number', 'rejected',
  'temporary_network_issue', 'incoming_out',
  'not_interested', 'not_interested_now', 'dnd', 'wrong_person', 'not_possible', 'language_barrier',
  'call_disconnected', 'email_sent', 'whatsapp_sent', 'transferred_senior',
  'query_complaint', 'receipt_request', 'csr_inquiry', 'wants_80g_details', 'wants_trust_documents',
]);
function isNewDonor(d) {
  return d.batch_type === 'new_data' || (d.batch_type == null && d.is_new !== false);
}
function filterDonors(list) {
  return list.filter(d => !HIDDEN_STATUSES.has(d.status) && !d.has_donated_current_month);
}

function filterAndSortDonors(list) {
  return filterDonors(list).sort((a, b) => {
      const aRetry = RETRYABLE_NOT_CONNECTED.has(a.status);
      const bRetry = RETRYABLE_NOT_CONNECTED.has(b.status);
      // tier: 0 = new workable, 1 = old workable, 2 = retryable tail
      const aNew = isNewDonor(a);
      const bNew = isNewDonor(b);
      const tierA = aRetry ? 2 : (aNew ? 0 : 1);
      const tierB = bRetry ? 2 : (bNew ? 0 : 1);
      if (tierA !== tierB) return tierA - tierB;
      const ta = a.assigned_at ? new Date(a.assigned_at).getTime() : 0;
      const tb = b.assigned_at ? new Date(b.assigned_at).getTime() : 0;
      return ta - tb;
    });
}

function normalizeDonorResponse(r) {
  if (Array.isArray(r)) return { donors: r, total: r.length };
  return { donors: r?.donors || [], total: r?.total ?? (r?.donors?.length || 0) };
}

function findNextDonorIndex(donors, currentId) {
  const idx = donors.findIndex(d => d.id === currentId);
  if (idx >= 0) {
    for (let i = idx + 1; i < donors.length; i++) {
      if (donors[i].id !== currentId) return i;
    }
  }
  for (let i = 0; i < donors.length; i++) {
    if (donors[i].id !== currentId) return i;
  }
  return -1;
}

function applyDonorPatch(list, donorId, ngoId, patch) {
  // Preserve the current queue order while applying the patch — only filter out
  // hidden/done donors, do NOT re-sort. Re-sorting here would move a just-fired
  // disposition (e.g. ringing -> retryable tail) to the end of the list, making
  // the next-lead cursor jump to a random "#N" instead of advancing #1 -> #2 -> #3.
  return filterDonors(list.map(d =>
    d.id === donorId && d.ngo_id === ngoId ? { ...d, ...patch } : d
  ));
}

function DonationDoneStamp({ donor }) {
  const monthLabel = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const type = donor.donor_type;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 8px' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{
          transform: 'rotate(-4deg)',
          background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
          color: '#fff',
          border: '3px dashed #bbf7d0',
          borderRadius: 10,
          padding: '24px 22px',
          boxShadow: '0 12px 32px rgba(22,163,74,.28)',
        }}>
          <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(255,255,255,.18)', border: '2px solid rgba(255,255,255,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 42, color: '#fff', fontWeight: 700 }}>check</span>
          </div>
          <div style={{ fontSize: type === 'one_time' ? 20 : 18, fontWeight: 900, letterSpacing: 1.2 }}>
            {type === 'quarterly'
              ? 'DONATION FOR THIS QUARTER DONE'
              : type === 'half_yearly'
              ? 'DONATION FOR THIS HALF-YEAR DONE'
              : type === 'yearly'
              ? 'DONATION FOR THIS YEAR DONE'
              : type === 'one_time'
              ? 'ONE TIME DONATION DONE'
              : 'DONATION FOR THIS MONTH DONE'}
          </div>
          <div style={{ marginTop: 12 }}>
            <span style={{ display: 'inline-block', border: '2px solid #fff', borderRadius: 999, padding: '3px 16px', fontSize: 10, fontWeight: 800, letterSpacing: .8 }}>
              {donor.has_verified_donation_current_month ? 'âœ“ VERIFIED' : 'â³ PENDING VERIFICATION'}
            </span>
          </div>
        </div>
        <div style={{ marginTop: 22, fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          {type === 'quarterly' ? (
            <>This donor already donated for this quarter. Press <strong>NEXT</strong> to continue to the next donor.</>
          ) : type === 'half_yearly' ? (
            <>This donor already donated for this half-year. Press <strong>NEXT</strong> to continue to the next donor.</>
          ) : type === 'yearly' ? (
            <>This donor already donated for this year. Press <strong>NEXT</strong> to continue to the next donor.</>
          ) : type === 'one_time' ? (
            <>This donor has already donated. Press <strong>NEXT</strong> to continue to the next donor.</>
          ) : (
            <>This donor already donated for {monthLabel}. Press <strong>NEXT</strong> to continue to the next donor.</>
          )}
        </div>
      </div>
    </div>
  );
}
function useTomorrowStr() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const initials = (name) => (name || '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

export default function MyDonors() {
  const isMobile = useIsMobile()
  const [donors, setDonors] = useState([]);
  const [total, setTotal] = useState(0);
  const [dataTab, setDataTab] = useState('new');
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [leadAmount, setLeadAmount] = useState('');
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [dateConfirmed, setDateConfirmed] = useState(false);
  const [callbackTime, setCallbackTime] = useState('');
  const [leadScreenshot, setLeadScreenshot] = useState(null);
  const [leadAddress, setLeadAddress] = useState('');
  const [leadPan, setLeadPan] = useState('');
  const [panError, setPanError] = useState('');
  const [leadDob, setLeadDob] = useState('');
  const [projectName, setProjectName] = useState('');
  const [leadRemark, setLeadRemark] = useState('');
  const [showRemark, setShowRemark] = useState(false);
  const [upiTransactionId, setUpiTransactionId] = useState('');
  const [transactionDatetime, setTransactionDatetime] = useState('');
  const [ocrFromName, setOcrFromName] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const prevActionRef = useRef(null);
  const [showConfirmPrev, setShowConfirmPrev] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [donations, setDonations] = useState([]);
  const [donationFilter, setDonationFilter] = useState('all');
  const [donationLoading, setDonationLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchingAll, setSearchingAll] = useState(false);
  const [returnToDonor, setReturnToDonor] = useState(null);
  const [resumeTo, setResumeTo] = useState(null);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [externalDonor, setExternalDonor] = useState(null);
  const searchRef = useRef(null);
  const backendSearchTimerRef = useRef(null);
  const debounceReloadRef = useRef(null);
  const initialMountRef = useRef(true);
  const pendingSelectRef = useRef(null);
  const manualTabSwitchRef = useRef(false);
  const autoFallbackToOldRef = useRef(false);
  const autoFallbackAttemptedRef = useRef(false);
  // Suppresses realtime-triggered reloads right after the FRO saves a
  // disposition. Logging a lead often causes the backend to INSERT/UPDATE a
  // fro_assignments row (findOrCreateAssignment), whose realtime event would
  // otherwise refetch + re-sort the list and snap the position indicator to a
  // "random" number. We let the local list update be authoritative for a short
  // window so the cursor advances sequentially (#1 -> #2 -> #3).
  const suppressRealtimeUntilRef = useRef(0);
  const [stations, setStations] = useState([]);
  const VIEW_STATE_KEY = 'mydonors_view_state';
  const savedView = (() => { try { return JSON.parse(localStorage.getItem(VIEW_STATE_KEY)); } catch { return null; } })();
  const [selectedStation, setSelectedStation] = useState(savedView?.selectedStation || 'all');
  const [selectedNgo, setSelectedNgo] = useState(savedView?.selectedNgo || null);
  const { isOnCall, activeCall, endCall, todayStats, startDonorView, endDonorView } = useCall();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResumeTo(null);
    setExternalDonor(null);

    const load = async (tab) => {
      try {
        // Capture localStorage snapshot BEFORE any state changes (avoids race condition)
        const sk = selectedStation !== 'all' ? selectedStation : 'all';
        const savedSnapshot = (() => { try { return JSON.parse(localStorage.getItem(`${tab}_${sk}_donor_progress`)); } catch { return null; } })();

        const r = await getMyDonors(null, null, stationOpts(tab, selectedStation));
        if (cancelled) return;
        const { donors: loaded, total: rTotal } = normalizeDonorResponse(r);
        const sortedDonors = filterAndSortDonors(loaded);
        // Auto-fallback: if current tab is empty, try the other tab (new<->old) once.
        // Prevents bounce loop when both tabs are empty.
        if (sortedDonors.length === 0 && !manualTabSwitchRef.current && !autoFallbackAttemptedRef.current) {
          if (tab === 'new') {
            autoFallbackToOldRef.current = true;
            autoFallbackAttemptedRef.current = true;
            setDataTab('old');
            setSelected(null);
            return;
          }
          if (tab === 'old') {
            autoFallbackAttemptedRef.current = true;
            setDataTab('new');
            setSelected(null);
            return;
          }
        }
        // Reset fallback flags when data found or manual switch
        if (sortedDonors.length > 0) {
          autoFallbackToOldRef.current = false;
          autoFallbackAttemptedRef.current = false;
        } else if (autoFallbackToOldRef.current && tab === 'old') {
          // Both tabs empty after new->old fallback; keep flag to show combined empty message
        } else if (tab === 'old' && autoFallbackAttemptedRef.current) {
          // Both empty after old->new fallback; flag already true, stay on current
        } else {
          autoFallbackToOldRef.current = false;
        }
        setDonors(sortedDonors);
        setTotal(rTotal);
        setMessage(null);
        let restored = false;

        if (pendingSelectRef.current) {
          const { donorId } = pendingSelectRef.current;
          pendingSelectRef.current = null;
          const found = sortedDonors.findIndex(d => d.id === donorId);
          if (found >= 0) {
            setIndex(found);
            restored = true;
          } else {
            setMessage({ type: 'error', text: 'This donor exists but isn\u2019t in your active list (already marked done). Open via Donor Detail or contact admin.' });
          }
        }

        // Restore from localStorage snapshot (captured before state changes)
        if (savedSnapshot) {
          const { id, idx } = savedSnapshot;
          if (id) {
            const found = sortedDonors.findIndex(d => d.id === id);
            if (found >= 0) { setIndex(found); restored = true; }
          }
          if (!restored && typeof idx === 'number' && idx < sortedDonors.length) {
            setIndex(idx); restored = true;
          }
        }

        // Fallback to backend progress (for cross-device restore)
        if (!restored) {
          try {
            const progress = await api('/fro/progress', { _prefix: 'ucs' });
            const progressStation = progress?.station || 'all';
            if (progressStation === (selectedStation !== 'all' ? selectedStation : 'all')) {
              const savedId = tab === 'new' ? progress?.new_donor_id : progress?.old_donor_id;
              if (savedId) {
                const found = sortedDonors.findIndex(d => d.id === savedId);
                if (found >= 0) { setIndex(found); restored = true; }
              }
              if (!restored) {
                const savedIndex = tab === 'new' ? progress?.new_donor_index : progress?.old_donor_index;
                if (savedIndex != null && savedIndex < sortedDonors.length) {
                  setIndex(savedIndex); restored = true;
                }
                }
              }
            } catch (e) { console.error('Error:', e.message); }
        }

        if (!restored) setIndex(0);
      } catch (err) {
        if (!cancelled) setMessage({ type: 'error', text: err.message });
      } finally {
        if (!cancelled) {
          setLoading(false);
          // allow next auto-fallback after one manual switch cycle completes
          setTimeout(() => { manualTabSwitchRef.current = false; }, 100);
        }
      }
    };

    // On first mount, restore the saved tab and position from progress
    (async () => {
      if (initialMountRef.current) {
        initialMountRef.current = false;
        try {
          const progress = await api('/fro/progress', { _prefix: 'ucs' });
          if (progress?.data_tab && progress.data_tab !== dataTab) {
            setDataTab(progress.data_tab);
            return;
          }
        } catch (e) { console.error('Error:', e.message); }
      }
      load(dataTab);
    })();

    return () => { cancelled = true; };
  }, [dataTab, selectedStation, selectedNgo]);

  useEffect(() => {
    if (donors.length > 0 && index >= donors.length) {
      setIndex(0);
    }
  }, [donors.length]);

  useEffect(() => {
    if (message && message.type !== 'error') {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  useEffect(() => {
    if (donors[index]) {
      endDonorView(false)
      startDonorView(donors[index].id)
    }
  }, [index, donors, endDonorView, startDonorView]);

  useEffect(() => {
    getMyStations().then(s => {
      const arr = Array.isArray(s) ? s : [];
      setStations(arr);
      // Acting FRO: default to claimed station (e.g. DH-1) not saved FD-1/all
      if (isImpersonating()) {
        try {
          const u = getUser('ucs');
          const act = Array.isArray(u?.act_stations) ? u.act_stations : [];
          if (act.length > 0) {
            const allowed = new Set(act.map(p => String(p.station ?? '').trim()));
            const cur = String(selectedStation ?? '').trim();
            if (!allowed.has(cur)) {
              setSelectedStation(String(act[0].station ?? '').trim() || (arr[0]?.station || 'all'));
            }
          }
        } catch {}
      }
      if (!savedView?.selectedNgo) {
        const ngoMap = {};
        arr.forEach(st => { if (st.ngo_id && !ngoMap[st.ngo_id]) ngoMap[st.ngo_id] = st.ngo_name || st.ngo_id; });
        const ngoList = Object.entries(ngoMap).map(([id, name]) => ({ ngo_id: id, ngo_name: name }));
        if (ngoList.length === 1) setSelectedNgo(ngoList[0].ngo_id);
      }
    }).catch((err) => { console.error('API error:', err.message); });
  }, []);

  const stationOpts = (tab, station) => {
    const opts = { newOnly: tab === 'new', oldOnly: tab === 'old' };
    if (station && station !== 'all') opts.station = station;
    if (selectedNgo) opts.ngoId = selectedNgo;
    return opts;
  };

  const reloadDonors = useCallback(() => {
    const current = donorsRef.current[indexRef.current];
    const currentId = current?.id;
    const currentNgo = current?.ngo_id;
    getMyDonors(null, null, stationOpts(dataTab, selectedStation)).then(r => {
      const { donors: loaded, total: rTotal } = normalizeDonorResponse(r);
      const fresh = filterAndSortDonors(loaded);
      if (currentId != null) {
        const newIdx = fresh.findIndex(d => d.id === currentId && d.ngo_id === currentNgo);
        if (newIdx >= 0 && indexRef.current !== newIdx) setIndex(newIdx);
      }
      setDonors(fresh);
      setTotal(rTotal);
    }).catch((err) => { console.error('API error:', err.message); });
  }, [dataTab, selectedStation, selectedNgo]);

  const debouncedReload = useCallback(() => {
    if (debounceReloadRef.current) clearTimeout(debounceReloadRef.current);
    debounceReloadRef.current = setTimeout(() => reloadDonors(), 2000);
  }, [reloadDonors]);

  const donorsRef = useRef(donors);
  const indexRef = useRef(index);
  donorsRef.current = donors;
  indexRef.current = index;
  const savingRef = useRef(false);

  const jumpToDonor = async (donorId, ngoId) => {
    const found = donors.findIndex(d => d.id === donorId && (!ngoId || d.ngo_id === ngoId));
    if (found >= 0) {
      setIndex(found);
      return true;
    }
    return false;
  };


  const isInsertInCurrentView = (row) => {
    if (!row) return false;
    if (row.status === 'reassigned') return false;
    if (row.batch_type && row.batch_type !== (dataTab === 'old' ? 'old_data' : 'new_data')) return false;
    if (selectedStation !== 'all' && row.station !== selectedStation) return false;
    if (selectedNgo && row.ngo_id && row.ngo_id !== selectedNgo) return false;
    return true;
  };

  useRealtime('fro_assignments', {
    event: 'INSERT',
    onInsert: (row) => {
      if (Date.now() < suppressRealtimeUntilRef.current) return;
      if (isInsertInCurrentView(row)) debouncedReload();
    },
  });

  const saveProgress = useCallback((tab, donorId, donorIndex) => {
    if (!donorId) return;
    const body = { data_tab: tab, station: selectedStation !== 'all' ? selectedStation : null };
    if (tab === 'new') {
      body.new_donor_id = donorId;
      body.new_donor_index = donorIndex;
    } else {
      body.old_donor_id = donorId;
      body.old_donor_index = donorIndex;
    }
    api('/fro/progress', { method: 'PUT', body: JSON.stringify(body), _prefix: 'ucs' }).catch((err) => { console.error('API error:', err.message); });
  }, [selectedStation]);

  const stationKey = selectedStation !== 'all' ? selectedStation : 'all';

  const switchTab = (tab) => {
    manualTabSwitchRef.current = true;
    autoFallbackAttemptedRef.current = false;
    autoFallbackToOldRef.current = false;
    if (donor) {
      saveProgress(dataTab, donor.id, index);
      localStorage.setItem(`${dataTab}_${stationKey}_donor_progress`, JSON.stringify({ id: donor.id, idx: index }));
    }
    setSelected(null);
    setDataTab(tab);
  };

  const donor = externalDonor || donors[index];

  useEffect(() => {
    if (!donor) return;
    localStorage.setItem(`mydonors_current_donor_${stationKey}`, JSON.stringify({ id: donor.id, ngo_id: donor.ngo_id, idx: index }));
  }, [donor?.id, donor?.ngo_id, index, stationKey]);

  const progressRef = useRef({ donor, index, dataTab });
  progressRef.current = { donor, index, dataTab };
  const formStateRef = useRef({});
  useEffect(() => {
    const handleBeforeUnload = () => {
      const p = progressRef.current;
      if (p.donor) {
        try {
          localStorage.setItem(`${p.dataTab}_${stationKey}_donor_progress`, JSON.stringify({ id: p.donor.id, idx: p.index }));
          const body = { data_tab: p.dataTab, station: selectedStation !== 'all' ? selectedStation : null };
          if (p.dataTab === 'new') { body.new_donor_id = p.donor.id; body.new_donor_index = p.index; }
          else { body.old_donor_id = p.donor.id; body.old_donor_index = p.index; }
          navigator.sendBeacon && navigator.sendBeacon(
            API_BASE + '/fro/progress',
            JSON.stringify(body)
          );
        } catch (e) { /* silent */ }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveViewState();
      const p = progressRef.current;
      if (p.donor) {
        saveFormState();
        localStorage.setItem(`${p.dataTab}_${stationKey}_donor_progress`, JSON.stringify({ id: p.donor.id, idx: p.index }));
        saveProgress(p.dataTab, p.donor.id, p.index);
      }
    };
  }, [stationKey, selectedStation]);
  const logs = detail?.logs || [];
  const totalCollected = detail?.total_collected || 0;
  const nextSchedule = detail?.next_schedule;

  const resetFormState = () => {
    setSelected(null); setNotes(''); setScheduledDate(''); setScheduledTime(''); setCallbackTime('');
    setLeadScreenshot(null); setScreenshotPreview(null); setLeadAddress(''); setLeadPan(''); setPanError('');
    setLeadDob(''); setProjectName(''); setLeadAmount(''); setLeadRemark(''); setShowRemark(false);
    setUpiTransactionId(''); setTransactionDatetime(''); setOcrFromName(''); setOcrLoading(false);
    setShowDonationPrompt(false); setDonationEntering(false); setDonationAmt(''); setDonationSaving(false);
    setDonationDt(new Date().toISOString().slice(0, 10));
    setMessage(null);
  };

  const formStateKey = (donorId) => `mydonors_form_state_${donorId}`;

  const saveFormState = () => {
    const f = formStateRef.current;
    if (!f.donor) return;
    const state = {
      selected: f.selected, notes: f.notes, scheduledDate: f.scheduledDate, scheduledTime: f.scheduledTime, dateConfirmed: f.dateConfirmed, callbackTime: f.callbackTime,
      leadScreenshot: f.leadScreenshot, screenshotPreview: f.screenshotPreview, leadAddress: f.leadAddress, leadPan: f.leadPan, panError: f.panError,
      leadDob: f.leadDob, projectName: f.projectName, leadAmount: f.leadAmount, leadRemark: f.leadRemark, showRemark: f.showRemark,
      upiTransactionId: f.upiTransactionId, transactionDatetime: f.transactionDatetime, ocrFromName: f.ocrFromName,
      showDonationPrompt: f.showDonationPrompt, donationEntering: f.donationEntering, donationAmt: f.donationAmt, donationDt: f.donationDt,
    };
    localStorage.setItem(formStateKey(f.donor.id), JSON.stringify(state));
  };

  const restoreFormState = () => {
    if (!donor) return;
    const saved = localStorage.getItem(formStateKey(donor.id));
    if (!saved) return;
    try {
      const s = JSON.parse(saved);
      setSelected(s.selected);
      setNotes(s.notes || '');
      setScheduledDate(s.scheduledDate || '');
      setScheduledTime(s.scheduledTime || '');
      setDateConfirmed(s.dateConfirmed || false);
      setCallbackTime(s.callbackTime || '');
      setLeadScreenshot(s.leadScreenshot || null);
      setScreenshotPreview(s.screenshotPreview || null);
      setLeadAddress(s.leadAddress || '');
      setLeadPan(s.leadPan || '');
      setPanError(s.panError || '');
      setLeadDob(s.leadDob || '');
      setProjectName(s.projectName || '');
      setLeadAmount(s.leadAmount || '');
      setLeadRemark(s.leadRemark || '');
      setShowRemark(s.showRemark || false);
      setUpiTransactionId(s.upiTransactionId || '');
      setTransactionDatetime(s.transactionDatetime || '');
      setOcrFromName(s.ocrFromName || '');
      setShowDonationPrompt(s.showDonationPrompt || false);
      setDonationEntering(s.donationEntering || false);
      setDonationAmt(s.donationAmt || '');
      setDonationDt(s.donationDt || new Date().toISOString().slice(0, 10));
    } catch (e) { /* ignore */ }
  };

  const clearFormState = () => {
    if (!donor) return;
    localStorage.removeItem(formStateKey(donor.id));
    resetFormState();
  };

  const saveViewState = () => {
    localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
      selectedStation, selectedNgo, dataTab,
      donorId: donor?.id || null,
      donorIdx: donor ? index : null,
    }));
  };

  useEffect(() => {
    if (donor) restoreFormState();
  }, [donor?.id]);

  const [donorTypeSaving, setDonorTypeSaving] = useState(false);
  const [showDonationPrompt, setShowDonationPrompt] = useState(false);
  const [donationAmt, setDonationAmt] = useState('');
  const [donationDt, setDonationDt] = useState(() => new Date().toISOString().slice(0, 10));
  const [donationSaving, setDonationSaving] = useState(false);
  const [donationEntering, setDonationEntering] = useState(false);
  const handleDonorTypeChange = async (e) => {
    const newType = e.target.value;
    if (!donor || !newType || newType === (donor.donor_type || '')) return;
    const donorId = donor.id;
    const prevType = donor.donor_type;
    setDonors(prev => prev.map(d => d.id === donorId ? { ...d, donor_type: newType } : d));
    setDonorTypeSaving(true);
    try {
      await updateDonorType(donorId, newType);
      setShowDonationPrompt(true);
      setDonationEntering(false);
      setDonationAmt('');
      setDonationDt(new Date().toISOString().slice(0, 10));
      setMessage(null);
    } catch (err) {
      console.error('updateDonorType error:', err.message);
      setDonors(prev => prev.map(d => d.id === donorId ? { ...d, donor_type: prevType } : d));
      setMessage({ type: 'error', text: 'Failed to update donor type' });
    } finally {
      setDonorTypeSaving(false);
    }
  };

  const handleDonationYes = () => {
    setDonationEntering(true);
    setDonationAmt('');
    setDonationDt(new Date().toISOString().slice(0, 10));
  };

  const handleDonationNo = () => {
    setShowDonationPrompt(false);
    setDonationEntering(false);
    setDonationAmt('');
  };

  const handleDonationSave = async () => {
    if (!donationAmt || isNaN(donationAmt) || Number(donationAmt) <= 0) {
      setMessage({ type: 'error', text: 'Enter a valid donation amount' });
      return;
    }
    if (!donationDt) {
      setMessage({ type: 'error', text: 'Select donation date' });
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setDonationSaving(true);
    setMessage(null);
    try {
      await addDonorLog(donor.id, {
        action: 'donation',
        amount_collected: Number(donationAmt),
        transaction_datetime: new Date(donationDt).toISOString(),
        notes: `Donation recorded (${donor.donor_type})`,
        ngo_id: donor.ngo_id,
      });
      setShowDonationPrompt(false);
      setDonationEntering(false);
      setDonationAmt('');
      setMessage({ type: 'success', text: 'Donation recorded' });
      const newDonors = applyDonorPatch(donorsRef.current, donor.id, donor.ngo_id, { status: 'donation_collected', is_new: false });
      setDonors(newDonors);
      const advance = () => {
        const nextIdx = findNextDonorIndex(newDonors, donor.id);
        if (nextIdx < 0 || !newDonors[nextIdx]) {
          setIndex(Math.min(indexRef.current, Math.max(0, newDonors.length - 1)));
          return;
        }
        setIndex(nextIdx);
        saveProgress(dataTab, newDonors[nextIdx].id, nextIdx);
      };
      if (resumeTo) {
        const ridx = newDonors.findIndex(d => d.id === resumeTo.id && d.ngo_id === resumeTo.ngo_id);
        setResumeTo(null);
        if (ridx >= 0) {
          setIndex(ridx);
          saveProgress(dataTab, newDonors[ridx].id, ridx);
        } else {
          advance();
        }
      } else {
        advance();
      }
      clearFormState();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDonationSaving(false);
      savingRef.current = false;
    }
  };

  const cancelledRef = useRef(false);
  const loadDetail = useCallback(() => {
    if (!donor) return;
    cancelledRef.current = false;
    const id = donor.id;
    const ngoId = donor.ngo_id;
    setDetailLoading(true);
    if (donor.is_new) {
      markDonorSeen(id, ngoId).then(() => {
        if (!cancelledRef.current) {
          setDonors(prev => prev.map(d =>
            d.id === id && d.ngo_id === ngoId ? { ...d, is_new: false } : d
          ));
        }
      }).catch(err => console.error('markDonorSeen error:', err));
    }
    getDonorDetail(id, ngoId).then(d => { if (!cancelledRef.current) { setDetail(d); setShowAllLogs(false); } }).catch(err => console.error('getDonorDetail error:', err)).finally(() => { if (!cancelledRef.current) setDetailLoading(false); });
  }, [donor?.id, donor?.ngo_id]);

  useEffect(() => { return () => { cancelledRef.current = true; }; }, [loadDetail]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const handleDropdownChange = (detailId) => {
    setSelected(detailId);
    setMessage(null);
    if (SCHEDULE_DATE_TYPES.has(detailId)) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      setScheduledDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      setScheduledTime('');
      setDateConfirmed(false);
    }
    if (SCHEDULE_TIME_TYPES.has(detailId)) {
      const now = new Date();
      setCallbackTime(now.toTimeString().slice(0, 5));
    }
    if (detailId === 'lead_done') {
      setProjectName(donor?.donor_project || '');
      setLeadAmount('');
      setPanError('');
    } else if (detailId === 'done') {
      setLeadAmount('');
    } else {
      setLeadScreenshot(null);
      setScreenshotPreview(null);
      setLeadAddress('');
      setLeadPan('');
      setPanError('');
      setLeadDob('');
      setProjectName('');
      setLeadAmount('');
      setUpiTransactionId('');
      setTransactionDatetime('');
      setOcrFromName('');
      setOcrLoading(false);
    }
  };

  const [screenshotPreview, setScreenshotPreview] = useState(null);
  formStateRef.current = {
    donor, selected, notes, scheduledDate, scheduledTime, dateConfirmed, callbackTime,
    leadScreenshot, screenshotPreview, leadAddress, leadPan, panError,
    leadDob, projectName, leadAmount, leadRemark, showRemark,
    upiTransactionId, transactionDatetime, ocrFromName,
    showDonationPrompt, donationEntering, donationAmt, donationDt,
  };

  const handleScreenshotChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      setLeadScreenshot({ base64, mime: file.type });
      setScreenshotPreview(result);
      setOcrLoading(true);
      try {
        const { upiTransactionId, transactionDatetime, amount, fromName } = await extractTransactionData(result);
        if (upiTransactionId) setUpiTransactionId(upiTransactionId);
        if (transactionDatetime) {
          const dt = new Date(transactionDatetime);
          if (!isNaN(dt.getTime())) {
            setTransactionDatetime(dt.toISOString().slice(0, 16));
          }
        }
        if (amount) setLeadAmount(prev => prev || amount);
        if (fromName) setOcrFromName(fromName);
      } catch (e) { console.error('Error:', e.message); }
      setOcrLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const filterDonations = (list, filter) => {
    if (!list) return [];
    if (!filter || filter === 'all') return list;
    const now = new Date();
    if (filter === 'monthly') {
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      return list.filter(d => d.date && String(d.date).slice(0, 7) === ym);
    }
    if (filter === 'yearly') {
      return list.filter(d => d.date && new Date(d.date).getFullYear() === now.getFullYear());
    }
    if (filter.startsWith('year_')) {
      const y = Number(filter.split('_')[1]);
      return list.filter(d => d.date && new Date(d.date).getFullYear() === y);
    }
    return list;
  };

  const loadDonations = async (period) => {
    if (!donor) return;
    setDonationLoading(true);
    try {
      const data = await getDonorDonations(donor.id, donor.ngo_id, period || 'all');
      setDonations(Array.isArray(data) ? data : []);
    } catch (err) {
      setDonations([]);
    } finally {
      setDonationLoading(false);
    }
  };

  const openDonationModal = () => {
    setShowDonationModal(true);
    setDonationFilter('all');
    if (donations.length === 0 && !donationLoading) loadDonations('all');
  };

  const handleDonationFilterChange = (filter) => {
    setDonationFilter(filter);
  };

  useEffect(() => {
    if (!donor) return;
    let cancelled = false;
    setDonationLoading(true);
    getDonorDonations(donor.id, donor.ngo_id, 'all')
      .then(data => { if (!cancelled) setDonations(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setDonations([]); })
      .finally(() => { if (!cancelled) setDonationLoading(false); });
    return () => { cancelled = true; };
  }, [donor?.id]);

  const handleSave = async () => {
    if (!selected) { setMessage({ type: 'error', text: 'Select a disposition' }); return; }
    if (SCHEDULE_DATE_TYPES.has(selected) && (!scheduledDate || !scheduledTime)) { setMessage({ type: 'error', text: 'Select date & time' }); return; }
    if (SCHEDULE_TIME_TYPES.has(selected) && !callbackTime) { setMessage({ type: 'error', text: 'Select time for callback' }); return; }
    if ((selected === 'lead_done' || selected === 'done') && (!leadAmount || isNaN(leadAmount) || Number(leadAmount) <= 0)) { setMessage({ type: 'error', text: 'Enter a valid payment amount' }); return; }
    if (savingRef.current) return;
    savingRef.current = true;

    setSaving(true); setMessage(null);
    try {
      const logData = {
        action: 'disposition',
        disposition_category: isConnected(selected) ? 'connected' : 'not_connected',
        disposition_detail: selected,
        notes: notes || null,
        ngo_id: donor.ngo_id,
      };
      if (SCHEDULE_DATE_TYPES.has(selected)) logData.scheduled_at = istDateTimeToIso(scheduledDate, scheduledTime);
      if (SCHEDULE_TIME_TYPES.has(selected)) {
        const todayIst = istDateString();
        logData.scheduled_at = istDateTimeToIso(todayIst, callbackTime);
      }
      if (selected === 'lead_done') {
        if (leadScreenshot) {
          const uploadResult = await uploadPaymentScreenshot(leadScreenshot.base64, leadScreenshot.mime);
          logData.payment_screenshot_url = uploadResult.file_url;
        }
        logData.donor_address = leadAddress || null;
        logData.pan_number = leadPan || null;
        logData.donor_dob = leadDob || null;
        logData.project_name = projectName || null;
        logData.amount_collected = leadAmount !== '' ? Number(leadAmount) : null;
        logData.remark = leadRemark || null;
        logData.upi_transaction_id = upiTransactionId || null;
        logData.transaction_datetime = transactionDatetime ? new Date(transactionDatetime).toISOString() : null;
      }
      if (selected === 'done') {
        logData.amount_collected = leadAmount !== '' ? Number(leadAmount) : null;
      }
      await addDonorLog(donor.id, logData);
      if (selected && isOnCall && activeCall?.donorId === donor.id) endCall();

      // Suppress realtime-triggered reloads for a short window so the INSERT
      // produced by this log's findOrCreateAssignment doesn't refetch/re-sort
      // the list and snap the "#N of M" position to a random value.
      suppressRealtimeUntilRef.current = Date.now() + 10000;
      if (debounceReloadRef.current) { clearTimeout(debounceReloadRef.current); debounceReloadRef.current = null; }

      // DND donors disappear from the queue immediately — the backend keeps
      // them hidden until the next month (see getMyDonors dnd filter).
      // Not-connected dispositions now vanish permanently too (latest-ever
      // rule in getMyDonors), so drop them locally as well: the just-worked
      // lead must never linger on screen.
      const removeLocally = !RETRYABLE_NOT_CONNECTED.has(selected);
      const newDonors = removeLocally
        ? filterAndSortDonors(donorsRef.current.filter(d => !(d.id === donor.id && d.ngo_id === donor.ngo_id)))
        : applyDonorPatch(donorsRef.current, donor.id, donor.ngo_id, { status: DISP_TO_STATUS[selected] || selected, is_new: false });
      setDonors(newDonors);

      if (returnToDonor) {
        setResumeTo(null);
        const returnIdx = newDonors.findIndex(d => d.id === returnToDonor.id && d.ngo_id === returnToDonor.ngo_id);
        if (returnIdx >= 0) {
          setIndex(returnIdx);
        } else {
          setIndex(Math.min(returnToDonor.idx, Math.max(0, newDonors.length - 1)));
        }
        setReturnToDonor(null);
      } else {
        const advance = () => {
          const nextIdx = findNextDonorIndex(newDonors, donor.id);
          if (nextIdx < 0 || !newDonors[nextIdx]) {
            // Queue exhausted: hold a valid position and say so instead of
            // silently snapping back to an already-worked lead.
            const fallbackIdx = Math.min(indexRef.current, Math.max(0, newDonors.length - 1));
            setIndex(fallbackIdx);
            setMessage({ type: 'success', text: 'All caught up — every lead here is dispositioned. New leads appear automatically.' });
            return;
          }
          setIndex(nextIdx);
          saveProgress(dataTab, newDonors[nextIdx].id, nextIdx);
        };
        if (resumeTo) {
          const ridx = newDonors.findIndex(d => d.id === resumeTo.id && d.ngo_id === resumeTo.ngo_id);
          setResumeTo(null);
          if (ridx >= 0) {
            setIndex(ridx);
            saveProgress(dataTab, newDonors[ridx].id, ridx);
          } else {
            advance();
          }
        } else {
          advance();
        }
      }
      clearFormState();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally { setSaving(false); savingRef.current = false; }
  };

  const handleSearch = (q) => {
    setSearchQuery(q);
    if (backendSearchTimerRef.current) { clearTimeout(backendSearchTimerRef.current); backendSearchTimerRef.current = null; }
    if (!q || q.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    const term = q.toLowerCase().trim();
    const filtered = donors.filter(d =>
      (d.donor_name || '').toLowerCase().includes(term) ||
      (d.donor_mobile || '').includes(term)
    );
    if (filtered.length > 0) {
      setSearchResults(filtered);
      setShowSearchDropdown(true);
      return;
    }
    // No match in the loaded page(s) â€” search the full backend stack (covers
    // donors beyond the loaded window, e.g. a donor at position 800+).
    backendSearchTimerRef.current = setTimeout(async () => {
      setSearchingAll(true);
      try {
        const backendResults = await searchDonorsByMobile(term);
        if (backendResults && backendResults.length > 0) {
          setSearchResults(backendResults);
          setShowSearchDropdown(true);
        } else {
          setSearchResults([]);
          setShowSearchDropdown(false);
        }
      } catch (err) {
        setSearchResults([]);
        setShowSearchDropdown(false);
      } finally {
        setSearchingAll(false);
      }
    }, 300);
  };

  const handleSelectSearchResult = async (resultIdx) => {
    setResumeTo(null);
    const r = searchResults[resultIdx];
    const donorId = r?.id || r?.donor_id;
    const curDonor = donors[index];
    const actualIdx = donors.findIndex(d => d.id === donorId);
    const makeExternal = (extra = {}) => {
      if (curDonor) setReturnToDonor({ id: curDonor.id, ngo_id: curDonor.ngo_id, idx: index });
      setExternalDonor({
        id: donorId,
        ngo_id: r?.ngo_id ?? extra.ngo_id,
        donor_name: r?.donor_name || r?.name || null,
        donor_mobile: r?.donor_mobile || r?.mobile_number || null,
        status: r?.status || 'pending',
        is_new: r?.batch_type === 'new_data',
        hidden: true,
        ...extra,
      });
    };
    if (actualIdx >= 0) {
      setReturnToDonor(curDonor ? { id: curDonor.id, ngo_id: curDonor.ngo_id, idx: index } : null);
      setIndex(actualIdx);
    } else if (donorId && (r?.batch_type || r?.station || r?.ngo_id)) {
      const targetTab = r.batch_type === 'old_data' ? 'old' : 'new';
      const targetNgo = r.ngo_id || selectedNgo;
      const validStation = r.station && stations.some(s => s.station === r.station && (!targetNgo || s.ngo_id === targetNgo));
      const targetStation = validStation ? r.station : 'all';
      const needsReload = targetTab !== dataTab || targetStation !== selectedStation || targetNgo !== selectedNgo;
      if (r.has_donated_current_month) {
        makeExternal({ has_donated_current_month: true, has_verified_donation_current_month: !!r.has_verified_donation_current_month, status: r.status || 'donation_collected' });
        setMessage({ type: 'success', text: 'This donor already donated this month.' });
      } else if (!needsReload) {
        const found = await jumpToDonor(donorId, r.ngo_id);
        if (!found) {
          makeExternal({ ngo_id: r?.ngo_id ?? targetNgo, station: r?.station || targetStation, batch_type: r?.batch_type || (targetTab === 'old' ? 'old_data' : 'new_data'), status: r?.status || 'pending' });
          setMessage({ type: 'info', text: 'This donor was already disposed — opened it here for your reference.' });
        }
      } else {
        if (curDonor) setReturnToDonor({ id: curDonor.id, ngo_id: curDonor.ngo_id, idx: index });
        pendingSelectRef.current = { donorId, ngoId: targetNgo };
        if (curDonor) { saveProgress(dataTab, curDonor.id, index); localStorage.setItem(`${dataTab}_${stationKey}_donor_progress`, JSON.stringify({ id: curDonor.id, idx: index })); }
        if (targetNgo !== selectedNgo) setSelectedNgo(targetNgo);
        if (targetStation !== selectedStation) setSelectedStation(targetStation);
        if (targetTab !== dataTab) switchTab(targetTab);
      }
    } else {
      makeExternal();
      setMessage({ type: 'info', text: 'Donor opened for reference.' });
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchDropdown(false);
  };

  const handleSearchAll = async () => {
    if (!searchQuery || searchQuery.trim().length < 2) return;
    setSearchingAll(true);
    try {
      const backendResults = await searchDonorsByMobile(searchQuery.trim());
      if (backendResults && backendResults.length > 0) {
        setSearchResults(backendResults);
        setShowSearchDropdown(true);
      } else {
        setMessage({ type: 'error', text: 'No donors found with this mobile number' });
        setShowSearchDropdown(false);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Search failed: ' + err.message });
    } finally {
      setSearchingAll(false);
    }
  };

  useEffect(() => {
    if (!showSearchDropdown) return;
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSearchDropdown]);

  const handleButtonClick = () => {
    if (selected) { handleSave(); return; }
    if (externalDonor) {
      setResumeTo(null);
      const backIdx = returnToDonor?.idx ?? 0;
      const backDonor = donors[backIdx];
      setExternalDonor(null);
      setReturnToDonor(null);
      setIndex(backIdx);
      if (backDonor) saveProgress(dataTab, backDonor.id, backIdx);
      return;
    }
    if (returnToDonor) {
      setResumeTo(null);
      setIndex(returnToDonor.idx);
      setReturnToDonor(null);
      return;
    }
    if (resumeTo) {
      const ridx = donors.findIndex(d => d.id === resumeTo.id && d.ngo_id === resumeTo.ngo_id);
      setResumeTo(null);
      if (ridx >= 0) {
        setIndex(ridx);
        saveProgress(dataTab, donors[ridx].id, ridx);
        return;
      }
    }
    const nextIdx = findNextDonorIndex(donors, donor.id);
    if (nextIdx < 0 || nextIdx === index || !donors[nextIdx]) {
      setMessage({ type: 'error', text: 'No more donors' });
      return;
    }
    if (donor && nextIdx < index) setResumeTo({ id: donor.id, ngo_id: donor.ngo_id });
    setIndex(nextIdx);
    saveProgress(dataTab, donors[nextIdx].id, nextIdx);
  };

  const fmt = callFmt

  const visibleDonations = filterDonations(donations, donationFilter);
  const yearOptions = [...new Set(
    donations.map(d => d.date ? new Date(d.date).getFullYear() : null).filter(Boolean)
  )].sort((a, b) => b - a);
  const allYears = yearOptions.length > 0 ? yearOptions : (() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2, y - 3, y - 4, y - 5];
  })();

  if (loading) return <SkeletonProfile />;

  if (donors.length === 0) {
    return (
      <div className="bento-grid">
        <div className="bento-col-12">
          {message && (
            <div className={`detail-message ${message.type}`} style={{ marginBottom: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{message.type === 'error' ? 'error' : 'check_circle'}</span>
              {message.text}
            </div>
          )}
          <div className="bento-card fro-empty-state">
            <div className="fro-empty-icon">
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--sage)', opacity: .5 }}>{dataTab === 'new' ? 'fiber_new' : 'history'}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>No {dataTab === 'new' ? 'new' : 'old'} data allotted</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', maxWidth: 280, textAlign: 'center', lineHeight: 1.5 }}>
              {stations.length === 0
                ? 'You are not assigned to any station yet. Ask your NGO admin to assign you to a station.'
                : (dataTab === 'new'
                  ? 'New data will appear here once distributed to your station.'
                  : 'Old data will appear here once uploaded to your station.')}
            </div>
            {(autoFallbackToOldRef.current || autoFallbackAttemptedRef.current) && donors.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', maxWidth: 280, textAlign: 'center', lineHeight: 1.5, marginTop: 4 }}>
                No new or old data is currently available at your station. Contact your admin if you expect data here.
              </div>
            ) : dataTab === 'new' ? (
              <button onClick={() => switchTab('old')} className="fro-empty-switch">
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>history</span>
                Try Old Data tab
              </button>
            ) : (
              <button onClick={() => switchTab('new')} className="fro-empty-switch">
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>fiber_new</span>
                Try New Data tab
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const timelineIcon = (log) => {
    if (log.action === 'disposition') return log.disposition_category === 'connected' ? 'check_circle' : 'cancel';
    const map = { call: 'call', visit: 'home', message: 'mail', follow_up: 'history', donation: 'payments', note: 'note' };
    return map[log.action] || 'circle';
  };

  const formatTime = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase();

  const logDate = (log) => (log.action === 'donation' || (log.disposition_detail === 'lead_done' && log.accounts_status === 'verified'))
    ? (log.transaction_datetime || log.verified_at || log.created_at)
    : log.created_at;

  const isThisMonth = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };

  const statusPill = (status) => {
    const label = status ? status.replace(/_/g, ' ') : 'unknown';
    return <span className={`pill ${STATUS_PILL_MAP[status] || 'pill-gray'}`}>{label}</span>;
  };

  return (<>
    <div className="detail-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="detail-split">
        {/* LEFT PANEL — merged profile + details */}
        <div className="detail-left" style={{ padding: 12 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Profile header */}
            <div style={{ textAlign: 'center', paddingBottom: 10, borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
              <div className="detail-avatar">{initials(donor.donor_name)}</div>
              <div className="detail-name">{donor.donor_name}</div>
              <div className="fro-donor-position">#{index + 1} of {total || donors.length}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {donor.is_new && (
                    <span style={{ padding: '1px 6px', borderRadius: 4, background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: .5 }}>NEW</span>
                  )}
                  {dataTab === 'old' && (
                    <span style={{ padding: '1px 6px', borderRadius: 4, background: '#7c3aed', color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: .5 }}>OLD</span>
                  )}
                {statusPill(donor.status || 'pending')}
                {donor.ngo_name && (
                  <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '1px 7px', borderRadius: 999, fontSize: 8, fontWeight: 700 }}>{donor.ngo_names?.join(', ') || donor.ngo_name}</span>
                )}
                {donor.station && selectedStation === 'all' && (
                  <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '1px 7px', borderRadius: 999, fontSize: 8, fontWeight: 700, border: '1px solid #93c5fd' }}>{donor.station}</span>
                )}
              </div>
            </div>

            {/* Telecaller call button + WhatsApp */}
            <div style={{ margin: '10px 0', borderRadius: 10, overflow: 'hidden', display: 'flex', gap: 6 }}>
              <div style={{ flex: 1, borderRadius: 10, overflow: 'hidden' }}>
                {isOnCall && activeCall?.donorId === donor.id ? (
                  <button onClick={(e) => { e.stopPropagation(); endCall() }} disabled={saving}
                    style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .5 : 1, display: 'flex', alignItems: 'center', gap: 8, transition: 'all .15s' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>call_end</span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 10, color: '#991b1b', fontWeight: 500 }}>On Call</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{callFmt(todayStats?.totalSeconds || 0)}</div>
                    </div>
                  </button>
                ) : (
                  <div style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', display: 'flex', alignItems: 'center', gap: 8, transition: 'all .15s' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>call</span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 10, color: '#166534', fontWeight: 500 }}>Call</div>
                      <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>{donor.donor_mobile || 'No number'}</div>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={(e) => { e.stopPropagation(); toast('Coming soon', 'info'); }}
                title="WhatsApp (coming soon)"
                style={{ width: 58, border: 'none', borderRadius: 12, background: '#cbd5e1', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, flexDirection: 'column', gap: 2, opacity: 0.7 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                <span style={{ fontSize: 7.5, fontWeight: 700, color: '#fff', letterSpacing: .3, lineHeight: 1 }}>WhatsApp</span>
              </button>
            </div>
            {/* Fields */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="detail-field-row">
                <div className="fld">
                  <label>City</label>
                  <div>{donor.donor_city || 'NA'}</div>
                </div>
              </div>
              <div className="detail-field-row">
                <div className="fld">
                  <label>Donor Type {donorTypeSaving && <span style={{ fontSize: 8, opacity: .5 }}>savingâ€¦</span>}</label>
                  <select value={donor.donor_type || ''} onChange={handleDonorTypeChange} disabled={donorTypeSaving}>
                    <option value="">â€” Select â€”</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half_yearly">Half-Yearly</option>
                    <option value="yearly">Yearly</option>
                    <option value="one_time">One Time</option>
                  </select>
                  {showDonationPrompt && (
                    <div style={{ marginTop: 8, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', overflow: 'hidden' }}>
                      {!donationEntering ? (
                        <div style={{ padding: '8px 10px' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#166534', marginBottom: 5 }}>
                            Has this donor donated?
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={handleDonationYes}
                              style={{ padding: '5px 16px', border: 'none', borderRadius: 5, background: '#16a34a', color: '#fff', fontSize: 10, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                              Yes
                            </button>
                            <button onClick={handleDonationNo}
                              style={{ padding: '5px 16px', border: '1px solid var(--line)', borderRadius: 5, background: '#fff', color: 'var(--ink)', fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                              No
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '8px 10px' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#166534', marginBottom: 6 }}>
                            Donation Details
                          </div>
                          <div className="detail-field-row" style={{ marginBottom: 4 }}>
                            <div className="fld">
                              <label>Amount (â‚¹)</label>
                              <input type="number" min="0" placeholder="e.g. 5000"
                                value={donationAmt} onChange={e => setDonationAmt(e.target.value)}
                                style={{ width: '100%', boxSizing: 'border-box' }} />
                            </div>
                            <div className="fld">
                              <label>Date</label>
                              <input type="date" value={donationDt} onChange={e => setDonationDt(e.target.value)}
                                style={{ width: '100%', boxSizing: 'border-box' }} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={handleDonationSave} disabled={donationSaving || !donationAmt || !donationDt}
                              style={{ flex: 1, padding: '6px 14px', border: 'none', borderRadius: 5, background: '#16a34a', color: '#fff', fontSize: 10, fontWeight: 700, fontFamily: 'inherit', cursor: donationSaving || !donationAmt || !donationDt ? 'not-allowed' : 'pointer', opacity: donationSaving || !donationAmt || !donationDt ? 0.5 : 1 }}>
                              {donationSaving ? 'Saving...' : 'Save Donation'}
                            </button>
                            {!donationSaving && (
                              <button onClick={() => setDonationEntering(false)}
                                style={{ padding: '5px 10px', border: '1px solid var(--line)', borderRadius: 5, background: '#fff', fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                                Back
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="detail-field-row">
                <div className="fld">
                  <label>Email</label>
                  <div style={{ fontStyle: donor.donor_email ? 'normal' : 'italic', color: donor.donor_email ? 'inherit' : 'var(--ink-soft)' }}>{donor.donor_email || 'No email'}</div>
                </div>
              </div>
              <div className="detail-field-row">
                <div className="fld">
                  <label>Donations</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch' }}>
                    {donationLoading ? (
                      <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Loading...</div>
                    ) : donations.length === 0 ? (
                      <div style={{ fontSize: 10, color: 'var(--ink-soft)', fontStyle: 'italic' }}>No donations yet</div>
                    ) : (
                      <>
                        {donations.slice(0, 6).map((d, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 10, padding: '2px 0', borderBottom: '1px dashed var(--line)' }}>
                            <span style={{ flexShrink: 0 }}>{d.date ? new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'â€”'}</span>
                            <span style={{ fontWeight: 600, marginLeft: 'auto' }}>â‚¹{Number(d.amount || 0).toLocaleString('en-IN')}</span>
                            <span className={`bento-pill ${d.status === 'verified' ? 'bento-pill-green' : d.status === 'rejected' ? 'bento-pill-red' : 'bento-pill-yellow'}`} style={{ fontSize: 8, padding: '1px 6px' }}>{d.status || 'â€”'}</span>
                          </div>
                        ))}
                        <button onClick={openDonationModal}
                          style={{ marginTop: 4, alignSelf: 'flex-start', padding: '4px 12px', border: 'none', borderRadius: 5, background: 'var(--sage)', color: '#fff', fontSize: 9, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                          View All {donations.length > 6 ? `(${donations.length})` : ''}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="detail-field-row">
                <div className="fld">
                  <label>Address</label>
                  <div style={{ fontStyle: detail?.donor_address ? 'normal' : 'italic', color: detail?.donor_address ? 'inherit' : 'var(--ink-soft)' }}>{detail?.donor_address || donor.donor_address || 'No address'}</div>
                </div>
              </div>
              {donor.donor_pan && (
                <div className="detail-field-row">
                  <div className="fld">
                    <label>PAN</label>
                    <div>{donor.donor_pan}</div>
                  </div>
                </div>
              )}
              {donor.donor_dob && (
                <div className="detail-field-row">
                  <div className="fld">
                    <label>DOB</label>
                    <div>{donor.donor_dob}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Status block */}
            {nextSchedule && !nextSchedule.is_completed && (
              <div className="detail-status-block" style={{
                background: new Date(nextSchedule.scheduled_at) < new Date() ? 'var(--md-error-container, #fef2f2)' : '#e0f2fe',
                color: new Date(nextSchedule.scheduled_at) < new Date() ? 'var(--md-error, #dc2626)' : '#0369a1',
                flexShrink: 0, marginTop: 8,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{new Date(nextSchedule.scheduled_at) < new Date() ? 'warning' : 'schedule'}</span>
                {new Date(nextSchedule.scheduled_at) < new Date() ? 'Overdue schedule' : 'Next: ' + new Date(nextSchedule.scheduled_at).toLocaleString()}
              </div>
            )}
            {donor.status === 'payment_rejected' && (
              <div className="detail-status-block" style={{ background: 'var(--md-error-container, #fef2f2)', color: 'var(--md-error, #dc2626)', flexShrink: 0, marginTop: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                Payment rejected by Accounts
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE PANEL â€” Tabs / Filters */}
        <div className="fro-mid-tabs">
          {/* NGO Tabs â€” only shown when FRO is assigned to multiple NGOs */}
          {(() => {
            const ngoMap = {};
            stations.forEach(st => { if (st.ngo_id && !ngoMap[st.ngo_id]) ngoMap[st.ngo_id] = st.ngo_name || st.ngo_id; });
            const ngoList = Object.entries(ngoMap).map(([id, name]) => ({ ngo_id: id, ngo_name: name }));
            if (ngoList.length <= 1) return null;
            return (
              <div className="fro-tab-segment" style={{ marginBottom: 4 }}>
                <button onClick={() => { if (donor) { saveProgress(dataTab, donor.id, index); localStorage.setItem(`${dataTab}_${stationKey}_donor_progress`, JSON.stringify({ id: donor.id, idx: index })); } setSelectedNgo(null); setSelectedStation('all'); }}
                  className={`fro-tab-btn ${!selectedNgo ? 'fro-tab-active-new' : ''}`}
                  style={{ fontSize: 10 }}>
                  All
                </button>
                {ngoList.map(n => (
                  <button key={n.ngo_id} onClick={() => { if (donor) { saveProgress(dataTab, donor.id, index); localStorage.setItem(`${dataTab}_${stationKey}_donor_progress`, JSON.stringify({ id: donor.id, idx: index })); } setSelectedNgo(n.ngo_id); setSelectedStation('all'); }}
                    className={`fro-tab-btn ${selectedNgo === n.ngo_id ? 'fro-tab-active-new' : ''}`}
                    style={{ fontSize: 10 }}>
                    {n.ngo_name}
                  </button>
                ))}
              </div>
            );
          })()}
          {/* Station Tabs */}
          {(() => {
            const allAssignedStations = [...new Set(stations.filter(s => !selectedNgo || s.ngo_id === selectedNgo).map(s => s.station))];
            const filteredStations = allAssignedStations;
            if (filteredStations.length === 0) return null;
            return (
            <div className="fro-tab-segment" style={{ marginBottom: 4 }}>
              <button onClick={() => { if (donor) { saveProgress(dataTab, donor.id, index); localStorage.setItem(`${dataTab}_${stationKey}_donor_progress`, JSON.stringify({ id: donor.id, idx: index })); } setSelectedStation('all') }}
                className={`fro-tab-btn ${selectedStation === 'all' ? 'fro-tab-active-new' : ''}`}
                style={{ fontSize: 10 }}>
                All Stations
              </button>
              {filteredStations.map(s => (
                <button key={s} onClick={() => { if (donor) { saveProgress(dataTab, donor.id, index); localStorage.setItem(`${dataTab}_${stationKey}_donor_progress`, JSON.stringify({ id: donor.id, idx: index })); } setSelectedStation(s) }}
                  className={`fro-tab-btn ${selectedStation === s ? 'fro-tab-active-old' : ''}`}
                  style={{ fontSize: 10 }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: selectedStation === s ? '#16a34a' : '#94a3b8', marginRight: 4, verticalAlign: 'middle' }} />
                  {s}
                </button>
              ))}
            </div>
            );
          })()}
          {/* New/Old Data Tabs */}
          <div className="fro-tab-segment">
            <button onClick={() => switchTab('new')}
              className={`fro-tab-btn ${dataTab === 'new' ? 'fro-tab-active-new' : ''}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>fiber_new</span>
              New Data
              <span className="fro-tab-count">{dataTab === 'new' ? donors.length : ''}</span>
            </button>
            <button onClick={() => switchTab('old')}
              className={`fro-tab-btn ${dataTab === 'old' ? 'fro-tab-active-old' : ''}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>history</span>
              Old Data
              <span className="fro-tab-count">{dataTab === 'old' ? donors.length : ''}</span>
            </button>
          </div>
          {/* Search donor by mobile */}
          <div ref={searchRef} style={{ position: 'relative', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--line)', padding: '4px 8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ink-soft)' }}>search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true); }}
                placeholder="Search donor by name or mobile..."
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 11, fontFamily: 'inherit', background: 'transparent', padding: '4px 0' }}
              />
              {searchQuery && (
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--ink-soft)', cursor: 'pointer' }}
                  onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearchDropdown(false); }}>close</span>
              )}
              <button onClick={handleSearchAll} disabled={searchingAll || searchQuery.trim().length < 2}
                style={{ padding: '3px 8px', border: 'none', borderRadius: 6, background: 'var(--sage)', color: '#fff', fontSize: 9, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {searchingAll ? '...' : 'Search All'}
              </button>
            </div>
            {showSearchDropdown && searchResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 100, maxHeight: 240, overflowY: 'auto', marginTop: 2 }}>
                {searchResults.map((r, i) => (
                  <div key={`${r.id || r.donor_id}-${r.ngo_id || ''}`} onClick={() => handleSelectSearchResult(i)}
                    style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: i < searchResults.length - 1 ? '1px solid var(--line)' : 'none', display: 'flex', alignItems: 'center', gap: 8, transition: 'background .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--md-primary-container, #e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--md-on-primary-container, #4338ca)', flexShrink: 0 }}>
                      {initials(r.donor_name || (r.donor_name ?? ''))}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}>{r.donor_name || 'Unknown'}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{r.donor_mobile || ''}{r.ngo_name ? ` Â· ${r.ngo_name}` : ''}{r.status ? ` Â· ${r.status.replace(/_/g, ' ')}` : ''}</div>
                    </div>
                    <span className={`pill ${STATUS_PILL_MAP[r.status] || 'pill-gray'}`} style={{ fontSize: 8, padding: '1px 5px' }}>{r.status ? r.status.replace(/_/g, ' ') : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {message && (
            <div className={`detail-message ${message.type}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{message.type === 'error' ? 'error' : 'check_circle'}</span>
              {message.text}
            </div>
          )}

          </div>
          <div className="fro-mid-connection">
          {/* Connection Status card */}
          <div className="detail-card" style={{ flex: 1, minHeight: 0 }}>
            {donor.has_donated_current_month ? (
              <DonationDoneStamp donor={donor} />
            ) : (
            <>
            <div className="detail-card-head">Connection Status</div>
            <div className="detail-card-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="detail-dropdown-row">
                <div className="dd">
                  <label>Connected</label>
                  <DispositionDropdown
                    options={CONNECTED}
                    value={selected !== null && isConnected(selected) ? selected : ''}
                    onChange={id => { if (id) handleDropdownChange(id); }}
                    tone={selected !== null && isConnected(selected) ? 'green' : null}
                  />
                </div>
                <div className="dd">
                  <label>Not Connected</label>
                  <DispositionDropdown
                    options={NOT_CONNECTED}
                    value={selected !== null && !isConnected(selected) ? selected : ''}
                    onChange={id => { if (id) handleDropdownChange(id); }}
                    tone={selected !== null && !isConnected(selected) ? 'red' : null}
                  />
                </div>
              </div>

              {SCHEDULE_DATE_TYPES.has(selected) && (
                <>
                  <div className="detail-field-row">
                    <div className="fld">
                      <label>Follow Up Date</label>
                        <DatePicker value={scheduledDate} onChange={e => { setScheduledDate(e.target.value); setDateConfirmed(true); }} placeholder="Select date" min={(() => { const t = new Date(); t.setDate(t.getDate() + 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })()} />
                    </div>
                  </div>
                  {dateConfirmed && (
                    <div className="detail-field-row">
                      <div className="fld">
                        <label>Follow Up Time</label>
                        <TimePicker value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} placeholder="Select time" />
                      </div>
                    </div>
                  )}
                </>
              )}

              {SCHEDULE_TIME_TYPES.has(selected) && (
                <div className="detail-field-row">
                  <div className="fld">
                    <label>Callback Time (Today)</label>
                    <TimePicker value={callbackTime} onChange={e => setCallbackTime(e.target.value)} placeholder="Select time" />
                  </div>
                </div>
              )}

              {selected === 'done' && (
                <div className="detail-field-row">
                  <div className="fld">
                    <label>Amount Collected</label>
                    <input type="number" min="0" value={leadAmount}
                      onChange={e => setLeadAmount(e.target.value)} placeholder="e.g. 5000" />
                  </div>
                </div>
              )}

              {selected === 'lead_done' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="detail-field-row">
                    <div className="fld">
                      <label>Project</label>
                      <select value={projectName} onChange={e => setProjectName(e.target.value)}>
                        <option value="">â€” Select Project â€”</option>
                        {PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="detail-field-row">
                    <div className="fld">
                      <label>Amount Collected</label>
                      <input type="number" min="0" value={leadAmount}
                        onChange={e => setLeadAmount(e.target.value)} placeholder="e.g. 5000" />
                    </div>
                  </div>
                  <div className="detail-field-row">
                    <div className="fld">
                      <label>Screenshot</label>
                      <label htmlFor="ss-input" className="ss-upload">
                        {screenshotPreview ? (
                          <div style={{ position: 'relative' }}>
                            <img src={screenshotPreview} alt="preview" className="ss-preview"
                              onClick={e => { e.preventDefault(); window.open(screenshotPreview, '_blank'); }} />
                            <span className="ss-remove"
                              onClick={e => { e.preventDefault(); setLeadScreenshot(null); setScreenshotPreview(null); document.getElementById('ss-input').value = ''; }}>close</span>
                          </div>
                        ) : (
                          <div className="ss-placeholder">
                            <span className="material-symbols-outlined">upload</span>
                            <span>Upload screenshot</span>
                          </div>
                        )}
                      </label>
                      <input id="ss-input" type="file" accept="image/*" onChange={handleScreenshotChange} />
                    </div>
                  </div>
                  <div className="detail-field-row">
                    <div className="fld">
                      <label>UPI Transaction ID {ocrLoading && <span style={{fontSize:9,color:'var(--md-outline)',marginLeft:4}}>OCRâ€¦</span>}</label>
                      <input type="text" value={upiTransactionId} onChange={e => setUpiTransactionId(e.target.value)} placeholder="Auto-detected from screenshot" />
                    </div>
                    <div className="fld">
                      <label>Transaction Date/Time</label>
                      <input type="datetime-local" value={transactionDatetime} onChange={e => setTransactionDatetime(e.target.value)} />
                    </div>
                  </div>
                  {ocrFromName && (
                    <div className="detail-field-row">
                      <div className="fld">
                        <label>Detected From Name</label>
                        <input type="text" value={ocrFromName} onChange={e => setOcrFromName(e.target.value)} placeholder="Auto-detected from screenshot" style={{color:'var(--md-outline)',fontStyle:'italic'}} readOnly />
                      </div>
                    </div>
                  )}
                  <div className="detail-field-row">
                    <div className="fld">
                      <label>Address</label>
                      <input type="text" value={leadAddress} onChange={e => setLeadAddress(e.target.value)} placeholder="Donor address" />
                    </div>
                  </div>
                  <div className="detail-field-row">
                    <div className="fld">
                      <label>PAN</label>
                      <input type="text" value={leadPan} onChange={e => {
                        const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        setLeadPan(v);
                        if (v.length === 0) {
                          setPanError('');
                        } else if (!PAN_REGEX.test(v) && v.length === 10) {
                          setPanError('Invalid PAN â€” use format: ABCDE1234F');
                        } else if (v.length > 0 && v.length < 10) {
                          setPanError('PAN must be 10 characters');
                        } else {
                          setPanError('');
                        }
                      }} placeholder="e.g. ABCDE1234F" maxLength={10} style={{ borderColor: panError ? '#dc2626' : undefined }} />
                      {leadPan.length > 0 && panError && <span style={{ fontSize: 9, color: '#dc2626', marginTop: 1, display: 'block' }}>{panError}</span>}
                    </div>
                    <div className="fld">
                      <label>DOB</label>
                      <input type="date" value={leadDob} onChange={e => setLeadDob(e.target.value)} />
                    </div>
                  </div>
                  <div className="detail-field-row">
                    <div className="fld">
                      <button onClick={() => setShowRemark(!showRemark)}
                        style={{ padding:'6px 14px', border:`1px solid ${showRemark ? 'var(--sage)' : 'var(--line)'}`, borderRadius:6, background: showRemark ? 'var(--sage)' : '#fff', color: showRemark ? '#fff' : 'var(--ink)', fontSize:10, fontWeight:700, fontFamily:'inherit', cursor:'pointer', transition:'all .12s' }}>
                        {showRemark ? 'Hide Remark' : 'Add Remark'}
                      </button>
                    </div>
                  </div>
                  {showRemark && (
                    <div className="detail-field-row">
                      <div className="fld">
                        <textarea value={leadRemark} onChange={e => setLeadRemark(e.target.value)} rows={2} placeholder="Enter remark..." style={{ width:'100%', padding:'6px 8px', border:'1px solid var(--line)', borderRadius:6, fontSize:11, fontFamily:'inherit', resize:'vertical', boxSizing:'border-box' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="detail-notes">
                <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 3 }}>Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Add notes here..." />
              </div>
            </div>
            </>
            )}
          </div>
        </div>

        {/* RIGHT PANEL â€” Timeline (20%) */}
        <div className="detail-right" style={{ padding: '12px 12px 12px 0' }}>
          {/* Timeline card */}
          <div className="detail-card" style={{ flex: 1, minHeight: 0 }}>
            <div className="detail-card-head">
              <span>CRM Timeline</span>
              {totalCollected > 0 && <span style={{ color: 'var(--sage)', fontSize: 10 }}>â‚¹{totalCollected.toLocaleString('en-IN')}</span>}
            </div>
            <div className="detail-card-scroll">
              {detailLoading ? (
                <div className="empty-timeline">Loading...</div>
              ) : logs.length === 0 ? (
                <div className="empty-timeline">No activity yet.</div>
              ) : (
                <div className="detail-timeline-list">
                  {logs.slice(0, showAllLogs ? logs.length : 12).map(log => {
                    const isDisp = log.action === 'disposition';
                    const cat = log.disposition_category;
                    const icon = timelineIcon(log);
                    const connected = isDisp && cat === 'connected';
                    const lbl = isDisp ? (log.disposition_detail?.replace(/_/g, ' ') || '') : log.action.replace(/_/g, ' ');
                    const bg = isDisp ? (connected ? '#f0fdf4' : '#fef2f2') : 'var(--bg)';
                    return (
                      <div key={log.id} className="detail-timeline-item" style={{ background: bg }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12, color: connected ? 'var(--sage)' : 'var(--md-error, #dc2626)', flexShrink: 0, marginTop: 1 }}>{icon}</span>
                        <div className="tl-info">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span className="tl-lbl">{lbl}</span>
                            <span className="tl-time">{formatTime(logDate(log))}</span>
                          </div>
                          {isThisMonth(logDate(log)) && (log.remark || log.notes) && <div className="tl-note">{log.remark || log.notes}</div>}
                          {log.amount_collected != null && <div className="tl-note" style={{ color: 'var(--sage)', fontWeight: 600 }}>â‚¹{Number(log.amount_collected).toLocaleString('en-IN')}</div>}
                          {isCollectionLog(log) && log.fro_worker_name && (
                            <div className="tl-note" style={{ color: 'var(--ink-soft)', fontSize: 9 }}>Collected by {log.fro_worker_name}</div>
                          )}
                          {log.disposition_detail === 'lead_done' && (
                            <span style={{ fontSize: 8, fontWeight: 700, background: 'var(--md-tertiary-fixed, #e0e7ff)', padding: '1px 4px', borderRadius: 2, textTransform: 'uppercase', display: 'inline-block', marginTop: 1 }}>
                              {log.accounts_status === 'verified' ? 'Verified' : log.accounts_status === 'rejected' ? 'Rejected' : 'Pending'}
                            </span>
                          )}
                          {log.disposition_detail === 'done' && (
                            <span style={{ fontSize: 8, fontWeight: 700, background: '#f0fdf4', color: 'var(--sage)', padding: '1px 4px', borderRadius: 2, textTransform: 'uppercase', display: 'inline-block', marginTop: 1 }}>Collected</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {logs.length > 12 && (
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                      <button onClick={() => setShowAllLogs(s => !s)}
                        style={{ padding: '5px 14px', border: '1px solid var(--line)', borderRadius: 6, background: 'transparent', fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', color: 'var(--sage)' }}>
                        {showAllLogs ? `Show Less` : `View All ${logs.length} Logs`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="fro-action-bar">
      <button className="btn-prev" disabled={index === 0 || saving} onClick={() => {
        setResumeTo(null);
        if (externalDonor) {
          const backIdx = returnToDonor?.idx ?? 0;
          const backDonor = donors[backIdx];
          setExternalDonor(null);
          setReturnToDonor(null);
          setIndex(backIdx);
          if (backDonor) saveProgress(dataTab, backDonor.id, backIdx);
          return;
        }
        if (selected) {
          prevActionRef.current = () => {
            if (donor) saveProgress(dataTab, donor.id, index);
            endDonorView(isOnCall && activeCall?.donorId === donor.id);
            resetFormState();
            setIndex(i => i - 1);
          };
          setShowConfirmPrev(true);
          return;
        }
        if (donor) saveProgress(dataTab, donor.id, index);
        endDonorView(isOnCall && activeCall?.donorId === donor.id);
        resetFormState();
        setIndex(i => i - 1);
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_back</span> Prev
      </button>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', paddingRight: 4 }}>
        {isOnCall && activeCall?.donorId === donor.id ? (
          <button onClick={endCall} disabled={saving} className="fro-btn-end-call" style={saving ? { opacity: .5, cursor: 'not-allowed' } : undefined}>
            <span className="fro-pulse-dot" />
            End Call
          </button>
        ) : (
          <span className="fro-btn-call" style={{ opacity: .55, cursor: 'default', pointerEvents: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>call</span>
            Call Now
          </span>
        )}

        <button className="btn-next"
          disabled={saving || (!selected && !donor.has_donated_current_month)}
          onClick={() => { endDonorView(isOnCall); handleButtonClick() }}>
          {saving ? 'Saving...' : selected ? (
            <><span className="material-symbols-outlined" style={{ fontSize: 13 }}>skip_next</span> Log {findDisp(selected)?.label || selected}</>
          ) : donor.has_donated_current_month ? (
            <><span className="material-symbols-outlined" style={{ fontSize: 13 }}>skip_next</span> NEXT →</>
          ) : (
            <><span className="material-symbols-outlined" style={{ fontSize: 13 }}>skip_next</span> NEXT</>
          )}
        </button>
      </div>
    </div>

    {/* Donation Modal */}
    {showDonationModal && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)' }} onClick={() => setShowDonationModal(false)}>
        <div style={{ background: '#fff', borderRadius: 12, width: isMobile ? 'calc(100vw - 32px)' : 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,.15)' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Donations â€” {donor.donor_name}</span>
            <span className="material-symbols-outlined" style={{ fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => setShowDonationModal(false)}>close</span>
          </div>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>Show:</span>
            {['all', 'monthly', 'yearly'].map(f => (
              <button key={f} onClick={() => handleDonationFilterChange(f)}
                style={{ padding: '4px 10px', border: `1px solid ${donationFilter === f ? 'var(--sage)' : 'var(--line)'}`, borderRadius: 6, background: donationFilter === f ? 'var(--sage)' : '#fff', color: donationFilter === f ? '#fff' : 'var(--ink)', fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all .12s' }}>
                {f === 'all' ? 'All' : f === 'monthly' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
            <select value={donationFilter.startsWith('year_') ? donationFilter : ''} onChange={e => handleDonationFilterChange(e.target.value)}
              style={{ padding: '4px 8px', border: `1px solid ${donationFilter.startsWith('year_') ? 'var(--sage)' : 'var(--line)'}`, borderRadius: 6, background: '#fff', fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="">Yearâ€¦</option>
              {allYears.map(y => <option key={y} value={`year_${y}`}>{y}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {!donationLoading && (
              <div style={{ padding: '0 0 8px', fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)' }}>
                {visibleDonations.length} {visibleDonations.length === 1 ? 'receipt' : 'receipts'}
              </div>
            )}
            {donationLoading ? (
              <div style={{ textAlign: 'center', padding: 20, fontSize: 11, color: 'var(--ink-soft)' }}>Loading...</div>
            ) : visibleDonations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, fontSize: 11, color: 'var(--ink-soft)' }}>No donations for this period.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    <th style={{ textAlign: 'left', padding: '5px 6px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '5px 6px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Amount</th>
                    <th style={{ textAlign: 'left', padding: '5px 6px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Mode</th>
                    <th style={{ textAlign: 'left', padding: '5px 6px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDonations.map((d, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '5px 6px' }}>{d.date ? new Date(d.date).toLocaleDateString('en-GB') : 'â€”'}</td>
                      <td style={{ padding: '5px 6px', fontWeight: 600 }}>â‚¹{Number(d.amount || 0).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '5px 6px' }}>{d.mode || 'â€”'}</td>
                      <td style={{ padding: '5px 6px' }}><span className={`bento-pill ${d.status === 'verified' ? 'bento-pill-green' : d.status === 'rejected' ? 'bento-pill-red' : 'bento-pill-yellow'}`}>{d.status || 'â€”'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', textAlign: 'right', fontSize: 10, color: 'var(--ink-soft)' }}>
            Total: â‚¹{Math.round(visibleDonations.reduce((s, d) => s + Number(d.amount || 0), 0)).toLocaleString('en-IN')}
          </div>
        </div>
      </div>
    )}
    {showConfirmPrev && (
      <div className="modal-overlay" onClick={() => setShowConfirmPrev(false)}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
          <div className="modal-body" style={{ textAlign: 'center', padding: '24px 22px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#f59e0b' }}>warning</span>
            <h3 style={{ margin: '10px 0 4px', fontSize: 15, fontWeight: 700 }}>Discard Disposition?</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>You have an unsaved disposition selection. Changing leads will discard it.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18 }}>
              <button className="btn" onClick={() => setShowConfirmPrev(false)}
                style={{ padding: '8px 20px', borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                Cancel
              </button>
              <button className="btn" onClick={() => { setShowConfirmPrev(false); prevActionRef.current?.(); }}
                style={{ padding: '8px 20px', borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: '#dc2626', color: '#fff', border: 'none' }}>
                Discard
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>);
}
