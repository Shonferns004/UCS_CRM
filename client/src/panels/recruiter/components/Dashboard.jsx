import { Link } from 'react-router-dom';
import { useRec, LEAD_STATUSES } from '../store';
import { Who } from './ui';
import { Users, Brief, Funnel, Star } from '../icons';
import RecentNotices from '../../../components/RecentNotices';

const STATUS_LABEL = LEAD_STATUSES.reduce((m, s) => { m[s.value] = s.label; return m; }, {});

const STATUS_STYLE = {
  hold:            { bg: '#F6EAD0', fg: '#8a6217' },
  followed_up:     { bg: '#E8EDE1', fg: '#3f4c34' },
  call_back:       { bg: '#E7F0F5', fg: '#2f4f5f' },
  scheduled:       { bg: '#DCEAF7', fg: '#1d5b8a' },
  screening:       { bg: '#F4E4DA', fg: '#8e4626' },
  not_interested:  { bg: '#F3DDD8', fg: '#9E3B2E' },
  rejected:        { bg: '#F3DDD8', fg: '#9E3B2E' },
  ringing:         { bg: '#F1EFE9', fg: '#6F6857' },
  unreachable:     { bg: '#F1EFE9', fg: '#6F6857' },
  busy:            { bg: '#F1EFE9', fg: '#6F6857' },
  switched_off:    { bg: '#F1EFE9', fg: '#6F6857' },
  wrong_number:    { bg: '#F1EFE9', fg: '#6F6857' },
  invalid:         { bg: '#F1EFE9', fg: '#6F6857' },
  default:         { bg: '#ECE7DA', fg: '#6F6857' },
};

export default function Dashboard() {
  const { leads, leadsLoading, leadStats, candidates, jobs, feed } = useRec();
  const total = leadStats?.total || leads.length;
  const newToday = leadStats?.newToday || 0;
  const byStatus = leadStats?.byStatus || {};
  const conversion = leadStats?.conversionRate || 0;
  const loading = leadsLoading && leads.length === 0;

  const cards = [
    { label:'Total Leads', icon:Users,  num:total,      foot:'All time',           c:'#5B6B4E' },
    { label:'New Today',   icon:Star,   num:newToday,   foot:'Added today',        c:'#4F6472' },
    { label:'On Hold',     icon:Funnel, num:byStatus?.hold || 0, foot:'Waiting',   c:'#C08A2E' },
    { label:'Conversion',  icon:Brief,  num:conversion + '%', foot:'Selected vs rejected', c:'#B5603A' },
  ];

  const topLeads = [...leads].slice(0, 5);

  return (
    <div className="dash">
      <div className="dash-cards">
        {cards.map(c => { const Icon = c.icon; return (
          <div className="dash-card" key={c.label} style={{ '--accent': c.c, '--accent-soft': c.c + '22' }}>
            <div className="dash-card-top">
              <span className="dash-card-label">{c.label}</span>
              <span className="dash-card-icon"><Icon width={17} height={17} /></span>
            </div>
            {loading ? (
              <>
                <div className="skeleton s-dash-num" />
                <div className="skeleton s-dash-foot" />
              </>
            ) : (
              <>
                <div className="dash-card-num">{c.num}</div>
                <div className="dash-card-foot">{c.foot}</div>
              </>
            )}
          </div>
        )})}
      </div>

      <div className="dash-grid">
        <section className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <h3 className="dash-panel-title">Recent Leads</h3>
              <span className="dash-panel-sub">Latest entries</span>
            </div>
            <Link to="/recruiter/leads" className="dash-view-all">View all &rarr;</Link>
          </div>
          {loading ? (
            <div className="lead-list">
              {Array.from({length:4}).map((_, i) => (
                <div className="lead-row" key={i}>
                  <div className="skeleton s-lead-avatar" />
                  <div style={{ flex:1 }}>
                    <div className="skeleton" style={{ height:13, width:140, marginBottom:6 }} />
                    <div className="skeleton" style={{ height:11, width:70 }} />
                  </div>
                  <div className="skeleton" style={{ height:11, width:90 }} />
                </div>
              ))}
            </div>
          ) : topLeads.length === 0 ? (
            <div className="empty">No leads yet.</div>
          ) : (
            <div className="lead-list">
              {topLeads.map(l => {
                const st = STATUS_STYLE[l.status] || STATUS_STYLE.default;
                return (
                  <div className="lead-row" key={l.id}>
                    <Who name={l.name} role={l.source} />
                    <span className="status-badge" style={{ background: st.bg, color: st.fg }}>
                      <span className="sb-dot" />
                      {STATUS_LABEL[l.status] || l.status || '—'}
                    </span>
                    <span className="lead-phone">{l.phone || '—'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <h3 className="dash-panel-title">Activity</h3>
              <span className="dash-panel-sub">Latest updates</span>
            </div>
          </div>
          <div className="dash-feed">
            {feed.map((f, i) => (
              <div className="feed-item2" key={f.id}>
                <div className="feed-rail">
                  <span className="feed-dot" />
                  {i < feed.length - 1 && <span className="feed-line" />}
                </div>
                <div className="feed-main">
                  <div className="feed-msg">{f.msg}</div>
                  <div className="feed-time">{f.time}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <RecentNotices limit={5} />
    </div>
  );
}
