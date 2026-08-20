# NGO Admin Panel - Donation Calling Control Panel
## Visual Design Specification

---

## 🎨 Design System

### Color Palette
| Role | Color | Usage |
|------|-------|-------|
| Primary | `#16a34a` (Green-600) | Success, received amounts, active states |
| Primary Light | `#dcfce7` (Green-50) | Backgrounds for positive metrics |
| Warning | `#f59e0b` (Amber-500) | Idle, pending, today collections |
| Warning Light | `#fffbeb` (Amber-50) | Idle backgrounds |
| Danger | `#ef4444` (Red-500) | Offline, overdue, critical alerts |
| Danger Light | `#fef2f2` (Red-50) | Overdue backgrounds |
| Info | `#3b82f6` (Blue-500) | Connected calls, assigned |
| Info Light | `#eff6ff` (Blue-50) | Connected backgrounds |
| Accent | `#ec4899` (Pink-500) | Interested donors |
| Accent Light | `#fdf2f8` (Pink-50) | Interested backgrounds |
| Purple | `#8b5cf6` (Violet-500) | Target achievement |
| Neutral | `#6b7280` (Gray-500) | Secondary text |
| Surface | `#ffffff` | Card backgrounds |
| Border | `#e5e7eb` (Gray-200) | Dividers, borders |

### Typography
- **Headers**: Inter, 600-700 weight
- **Body**: Inter, 400-500 weight
- **Numbers**: Inter, 700-800 weight, tabular-nums
- **Labels**: Inter, 500 weight, uppercase, tracking-wide, text-xs

### Icons (Lucide React)
```jsx
import {
  Users, Phone, PhoneCall, Heart, DollarSign, Target,
  TrendingUp, TrendingDown, AlertTriangle, Clock,
  UserCheck, UserX, UserMinus, Activity, BarChart3,
  ArrowUpRight, ArrowDownRight, Filter, Search,
  ChevronDown, ChevronRight, MoreVertical, Download,
  RefreshCw, Calendar, UserPlus, ArrowLeftRight,
  CheckCircle2, XCircle, AlertCircle, Bell,
  Eye, Edit, Trash2, Mail, Phone, MapPin,
  Trophy, Medal, Flag, Zap, Shield
} from 'lucide-react';
```

### Animation Specs
- **Card hover**: `transition: all 0.2s ease; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08)`
- **Number count-up**: `animation: countUp 0.8s ease-out forwards`
- **Progress bars**: `transition: width 0.6s ease-out`
- **Idle pulse**: `animation: pulse 1.5s ease-in-out infinite`
- **Fade in**: `animation: fadeIn 0.3s ease-out`
- **Slide up**: `animation: slideUp 0.4s ease-out`

---

## 📐 Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  HEADER BAR                                                                                         │
│  ┌─────────────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │ 🏢 NGO Selector ▼   │  │ 📅 Date Range│  │ 🔄 Refresh   │  │  👤 Admin Name  ▼  ⚙️  🌙       │  │
│  └─────────────────────┘  └──────────────┘  └──────────────┘  └─────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  KPI ROW (10 cards - responsive grid)                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────┐ │
│  │ 👥 Total │ │ 🟢 Call  │ │ 🟡 Idle  │ │ 🔴 Off   │ │ 📞 Calls │ │ 📲 Conn  │ │ ❤️ Int │ │ 💵 │ │
│  │  Tele-   │ │  ing     │ │          │ │ line     │ │          │ │  ected   │ │  erested│ │Rec │ │
│  │ callers  │ │          │ │          │ │          │ │          │ │          │ │         │ │eiv │ │
│  │   50     │ │   35     │ │    8     │ │    7     │ │  1,850   │ │  1,120   │ │   245   │ │ ₹  │ │
│  │          │ │          │ │          │ │          │ │          │ │          │ │         │ │1.3L│ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────┘ │
│  ┌──────────┐ ┌──────────┐                                                                        │
│  │ 📅 F/Up  │ │ 🎯 Tgt   │                                                                        │
│  │  Due     │ │  Achv    │                                                                        │
│  │   180    │ │   78%    │                                                                        │
│  └──────────┘ └──────────┘                                                                        │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ROW 2: DONATION FUNNEL (Left)          │  HOURLY PERFORMANCE (Right)                            │
│  ┌────────────────────────────────────┐  │  ┌────────────────────────────────────────────────┐   │
│  │         DONATION FUNNEL            │  │  │        HOURLY PERFORMANCE (Today)              │   │
│  │  ████████████████████ 5000 Assigned│  │  │  ┌────────────────────────────────────────┐   │   │
│  │  ██████████████████    3200 Called │  │  │  │ ████████████ ████████████████████████ │   │   │
│  │  ████████████████      1850 Conned │  │  │  │ ████████████ ████████████████████████ │   │   │
│  │  ████████████          450 Interest│  │  │  │ 09  10  11  12  13  14  15  16  17  18 │   │   │
│  │  ████████              245 Received│  │  │  └────────────────────────────────────────┘   │   │
│  │                                    │  │  │  [📊 Bars: Calls/Connected] [📈 Line: ₹ Amt]    │   │
│  │  [Click stage to filter table]     │  │  │  [📥 Export CSV]                             │   │
│  └────────────────────────────────────┘  │  └────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ROW 3: TOP / BOTTOM PERFORMERS                                                                    │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐ │
│  │ 🏆 TOP 5 - AMOUNT   │ │ 🏆 TOP 5 - DONORS   │ │ 🏆 TOP 5 - CONV %   │ │ ⚠️ BOTTOM 5 - TGT  │ │
│  │ 1. Neha      ₹24,000│ │ 1. Neha        13   │ │ 1. Priya      18.2% │ │ 1. Rajesh      35% │ │
│  │ 2. Amit      ₹21,500│ │ 2. Amit        11   │ │ 2. Neha       15.8% │ │ 2. Suresh      42% │ │
│  │ 3. Priya     ₹19,800│ │ 3. Priya       10   │ │ 3. Amit       14.5% │ │ 3. Kavita      48% │ │
│  │ 4. Suresh    ₹18,200│ │ 4. Suresh       9   │ │ 4. Rahul      12.1% │ │ 4. Manoj       51% │ │
│  │ 5. Kavita    ₹16,700│ │ 5. Kavita       8   │ │ 5. Suresh     11.8% │ │ 5. Deepak      55% │ │
│  └─────────────────────┘ └─────────────────────┘ └─────────────────────┘ └─────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ROW 4: TELECALLER PERFORMANCE TABLE (MAIN - Full Width)                                           │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 🔍 Search...  [📊 Columns ▼]  [📥 Export]                                                    │  │
│  ├────┬─────────┬───────┬─────────┬─────────┬────────┬────────┬────────┬────────┬─────────────┤  │
│  │ #  │ Tele-   │ Calls │ Connect │Interested│Received│  Amt   │ Target │ Action │  Status     │  │
│  │    │ caller  │       │   ed    │          │ Donors │ (₹)    │   %    │        │             │  │
│  ├────┼─────────┼───────┼─────────┼─────────┼────────┼────────┼────────┼────────┼─────────────┤  │
│  │ 1  │ 🟢 Neha │  135  │   82    │   25     │   13   │ 24,000 │  110%  │ ⋮ ▼    │ 🟢 Calling  │  │
│  │ 2  │ 🟡 Amit │  120  │   75    │   18     │   11   │ 21,500 │  98%   │ ⋮ ▼    │ 🟡 Idle 5m  │  │
│  │ 3  │ 🟢 Priya│  142  │   88    │   22     │   10   │ 19,800 │  105%  │ ⋮ ▼    │ 🟢 Calling  │  │
│  │ 4  │ 🔴 Rajesh│  45  │   22    │   5      │   2    │  3,200 │  35%   │ ⋮ ▼    │ 🔴 Offline  │  │
│  │ 5  │ 🟡 Suresh│  98  │   58    │   12     │   7    │ 14,500 │  82%   │ ⋮ ▼    │ 🟡 Idle 12m │  │
│  │    │         │       │         │          │        │        │        │        │  ⚠️ ALERT   │  │
│  └────┴─────────┴───────┴─────────┴─────────┴────────┴────────┴────────┴────────┴─────────────┘  │
│  Inline Action Menu (per row):                                                                    │
│  ┌─────────────────────────┐                                                                      │
│  │ 👁 View Details         │                                                                      │
│  │ 🔄 Reassign Donors      │                                                                      │
│  │ 📅 Change Follow-up     │                                                                      │
│  │ ✅ Verify Payment       │                                                                      │
│  │ 📞 Call History         │                                                                      │
│  │ 🗑 Remove Assignment    │                                                                      │
│  └─────────────────────────┘                                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ROW 5: FOLLOW-UP MANAGEMENT (Integrated Tabbed Section)                                          │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  [🔴 Overdue: 35]  [🟠 Today: 145]  [🟡 Tomorrow: 82]  [🟢 Completed: 210]                  │  │
│  ├──────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │  OVERDUE TAB (Active)                                                                        │  │
│  │  ┌────┬──────────┬────────────┬──────────┬────────────┬────────────┬──────────────────────┐  │
│  │  │ #  │Telecaller│ Donor      │ Mobile   │ Expected ₹ │ Follow-up  │ Action               │  │
│  │  ├────┼──────────┼────────────┼──────────┼────────────┼────────────┼──────────────────────┤  │
│  │  │ 1  │ Rahul    │ John Doe   │ 98765... │ ₹5,000     │ Aug 18     │ [Reassign ▼] [Date]  │  │
│  │  │ 2  │ Amit     │ Mary Smith │ 87654... │ ₹3,000     │ Aug 17     │ [Reassign ▼] [Date]  │  │
│  │  │ 3  │ Suresh   │ Raj Kumar  │ 76543... │ ₹7,500     │ Aug 15     │ [Reassign ▼] [Date]  │  │
│  │  └────┴──────────┴────────────┴──────────┴────────────┴────────────┴──────────────────────┘  │
│  └──────────────────────────────────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  IDLE ALERT BANNER (Fixed Bottom / Toast)                                                         │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ ⚠️  Amit — No activity for 15 minutes  [👁 View]  [✖ Dismiss]                                │  │
│  │ ⚠️  Suresh — Idle 12 minutes  [👁 View]  [✖ Dismiss]                                         │  │
│  └──────────────────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧩 Component Specifications

### 1. KPI Card Component
```jsx
// KPICard.jsx
<KPICard
  icon={<Users className="w-5 h-5 text-green-600" />}
  iconBg="bg-green-50"
  label="Total Telecallers"
  value={50}
  trend={{ value: 5, direction: 'up' }}  // optional
  animate={true}
>

// Variants:
<KPICard icon={<PhoneCall />} iconBg="bg-blue-50" label="Total Calls" value={1850} color="text-blue-600" />
<KPICard icon={<Heart />} iconBg="bg-pink-50" label="Interested" value={245} color="text-pink-600" />
<KPICard icon={<DollarSign />} iconBg="bg-green-50" label="Received" value="₹1,32,500" color="text-green-600" isCurrency />
<KPICard icon={<Target />} iconBg="bg-purple-50" label="Target Achievement" value="78%" color="text-purple-600" />
<KPICard icon={<AlertTriangle />} iconBg="bg-red-50" label="Follow-ups Due" value={180} color="text-red-600" alert />
```

### 2. Donation Funnel Component
```jsx
// DonationFunnel.jsx - Using Recharts Funnel or Custom SVG
<DonationFunnel
  data={[
    { stage: 'Assigned', count: 5000, color: '#3b82f6', icon: <Users /> },
    { stage: 'Called', count: 3200, color: '#8b5cf6', icon: <Phone /> },
    { stage: 'Connected', count: 1850, color: '#06b6d4', icon: <PhoneCall /> },
    { stage: 'Interested', count: 450, color: '#ec4899', icon: <Heart /> },
    { stage: 'Received', count: 245, color: '#16a34a', icon: <DollarSign /> },
  ]}
  onStageClick={(stage) => filterTelecallerTable(stage)}
  animate={true}
>

// Visual: Trapezoid segments with percentage labels, hover highlight, click to filter
```

### 3. Hourly Performance Chart
```jsx
// HourlyPerformanceChart.jsx - Recharts ComposedChart
<HourlyPerformanceChart
  data={[
    { hour: '09-10', calls: 180, connected: 105, interested: 22, amount: 12000 },
    { hour: '10-11', calls: 220, connected: 135, interested: 31, amount: 18500 },
    { hour: '11-12', calls: 250, connected: 150, interested: 38, amount: 27000 },
    // ...
  ]}
  onExport={() => downloadCSV()}
  showLegend={true}
  animate={true}
>

// Features:
// - Bar chart: Calls (light blue) + Connected (dark blue)
// - Line chart: Amount Received (green) on secondary Y-axis
// - Dots on line with tooltip showing exact amount
// - Export CSV button top-right
// - Responsive: stacks on mobile
```

### 4. Top/Bottom Performers Cards
```jsx
// TopBottomPerformers.jsx
<TopBottomPerformers
  top={[
    { metric: 'Amount', data: [{ rank: 1, name: 'Neha', value: '₹24,000', avatar: 'N' }, ...] },
    { metric: 'Donors', data: [{ rank: 1, name: 'Neha', value: '13', avatar: 'N' }, ...] },
    { metric: 'Conversion %', data: [{ rank: 1, name: 'Priya', value: '18.2%', avatar: 'P' }, ...] },
  ]}
  bottom={[
    { metric: 'Target %', data: [{ rank: 1, name: 'Rajesh', value: '35%', avatar: 'R', alert: true }, ...] },
  ]}
>

// Card design:
// - Gradient border top: green for top, red for bottom
// - Rank badge: 🥇 🥈 🥉 then 4, 5
// - Avatar circle with initials
// - Trend micro-sparkline optional
```

### 5. Telecaller Performance Table (Main)
```jsx
// TelecallerTable.jsx - TanStack Table or custom
<TelecallerTable
  data={[
    {
      id: 1,
      name: 'Neha',
      status: 'calling', // calling | idle | offline | break
      calls: 135,
      connected: 82,
      interested: 25,
      receivedDonors: 13,
      receivedAmount: 24000,
      targetPct: 110,
      lastActivity: '2 min ago',
      idleMinutes: 0,
    },
    // ...
  ]}
  columns={[
    { key: 'name', header: 'Telecaller', render: StatusAvatar },
    { key: 'calls', header: 'Calls', align: 'right' },
    { key: 'connected', header: 'Connected', align: 'right' },
    { key: 'interested', header: 'Interested', align: 'right' },
    { key: 'receivedDonors', header: 'Received', align: 'right' },
    { key: 'receivedAmount', header: 'Amount (₹)', align: 'right', format: currency },
    { key: 'targetPct', header: 'Target %', align: 'right', format: pct },
    { key: 'actions', header: 'Action', render: ActionMenu },
    { key: 'status', header: 'Live Status', render: LiveStatusBadge },
  ]}
  onRowAction={handleInlineAction}
  sortable
  filterable
  pagination={{ pageSize: 20 }}
>

// Action Menu Items (per row):
const actionItems = [
  { label: 'View Details', icon: <Eye />, action: 'view', route: `/ngo-admin/fro/${id}/summary` },
  { label: 'Reassign Donors', icon: <ArrowLeftRight />, action: 'reassign', modal: true },
  { label: 'Change Follow-up', icon: <Calendar />, action: 'followup', modal: true },
  { label: 'Verify Payment', icon: <CheckCircle2 />, action: 'verify', modal: true },
  { label: 'Call History', icon: <Phone />, action: 'history', modal: true },
  { label: 'Remove Assignment', icon: <Trash2 />, action: 'remove', confirm: true, variant: 'destructive' },
];

// Live Status Badge:
const statusConfig = {
  calling: { icon: <Activity className="w-3 h-3 animate-pulse" />, label: 'Calling', color: 'green', bg: 'bg-green-50' },
  idle: { icon: <Clock className="w-3 h-3" />, label: 'Idle {minutes}m', color: 'amber', bg: 'bg-amber-50', alert: true },
  offline: { icon: <UserX className="w-3 h-3" />, label: 'Offline', color: 'gray', bg: 'bg-gray-50' },
  break: { icon: <Coffee className="w-3 h-3" />, label: 'Break', color: 'blue', bg: 'bg-blue-50' },
};
```

### 6. Follow-up Manager (Tabbed)
```jsx
// FollowupManager.jsx
<FollowupManager
  buckets={{
    overdue: 35,
    today: 145,
    tomorrow: 82,
    completed: 210,
  }}
  data={[
    // Overdue
    { assignmentId: 101, telecaller: 'Rahul', donorName: 'John Doe', mobile: '9876543210', expectedAmount: 5000, followupDate: '2026-08-18', daysOverdue: 2, bucket: 'overdue' },
    { assignmentId: 102, telecaller: 'Amit', donorName: 'Mary Smith', mobile: '8765432109', expectedAmount: 3000, followupDate: '2026-08-17', daysOverdue: 3, bucket: 'overdue' },
    // Today
    { assignmentId: 103, telecaller: 'Priya', donorName: 'Raj Kumar', mobile: '7654321098', expectedAmount: 7500, followupDate: '2026-08-20', daysOverdue: 0, bucket: 'today' },
    // ...
  ]}
  onReassign={(assignmentId, newFroId, newDate) => api.put(`/followups/${assignmentId}/reassign`, { new_fro_worker_id: newFroId, new_followup_date: newDate })}
  onDateChange={(assignmentId, newDate) => api.put(`/followups/${assignmentId}/date`, { followup_date: newDate })}
>

// Tab Styles:
// - Overdue: Red badge, red left border
// - Today: Amber badge, amber left border
// - Tomorrow: Yellow badge, yellow left border
// - Completed: Green badge, green left border

// Reassign Modal:
<ReassignModal
  open={reassignOpen}
  onClose={() => setReassignOpen(false)}
  telecallers={availableFROs}
  onConfirm={(froId, date) => handleReassign(selectedAssignment, froId, date)}
/>
```

### 7. Idle Alert Banner
```jsx
// IdleAlertBanner.jsx - Fixed bottom, animated slide-up
<IdleAlertBanner
  alerts={[
    { froId: 12, name: 'Amit', idleMinutes: 18, lastActivity: '2026-08-20T10:42:00Z', status: 'idle' },
    { froId: 15, name: 'Suresh', idleMinutes: 12, lastActivity: '2026-08-20T10:45:00Z', status: 'idle' },
  ]}
  onView={(froId) => navigate(`/ngo-admin/fro-status?fro_id=${froId}`)}
  onDismiss={(froId) => dismissAlert(froId)}
  autoHide={30000} // auto-hide after 30s if not dismissed
>

// Animation: slideUp from bottom, pulse on icon
// Style: Red background, white text, high z-index
// Dismiss: Individual X or "Dismiss All"
// Click View: Navigate to FRO Live Status detail
```

---

## 📱 Responsive Breakpoints

| Breakpoint | Layout Changes |
|------------|----------------|
| **≥1440px** | 4-col KPI, 2-col funnel/hourly, 4-col top/bottom, full table |
| **1024-1439px** | 5-col KPI (2 rows), stacked funnel/hourly, 2x2 top/bottom, horizontal scroll table |
| **768-1023px** | 3-col KPI, stacked all charts, 2-col top/bottom, card-based table |
| **<768px** | 2-col KPI, stacked everything, collapsible sections, card list for telecallers |

---

## ♿ Accessibility

- **Color contrast**: All text ≥ 4.5:1 ratio
- **Focus states**: Visible ring `focus-visible:ring-2 focus-visible:ring-green-500`
- **ARIA labels**: All icon buttons, status badges, interactive elements
- **Keyboard nav**: Tab through all interactive elements
- **Screen readers**: Live region for idle alerts, table headers properly scoped
- **Reduced motion**: Respect `prefers-reduced-motion` for animations

---

## 🔄 Real-time Updates

| Data | Source | Frequency |
|------|--------|-----------|
| KPIs | `tl-dashboard` API | 30 sec poll + manual refresh |
| Funnel | `donation-funnel` API | 60 sec poll |
| Hourly | `hourly-performance` API | 5 min (historical) |
| Telecaller Table | `fro-performance` API | 30 sec poll |
| Live Status | `fro_live_status` Realtime | **Instant** (Supabase realtime) |
| Follow-ups | `followups` API | 60 sec poll |
| Idle Alerts | `idle-alerts` API | 30 sec poll |

---

## 📦 Component File Structure

```
ucs crm/src/panels/ngo-admin/
├── pages/
│   └── Dashboard.jsx                    # Main dashboard (REWRITE)
├── components/
│   ├── KPICard.jsx                      # Reusable KPI card
│   ├── DonationFunnel.jsx               # Funnel visualization
│   ├── HourlyPerformanceChart.jsx       # ComposedChart with export
│   ├── TopBottomPerformers.jsx          # 4-card performer grid
│   ├── TelecallerTable.jsx              # Main sortable table + actions
│   ├── FollowupManager.jsx              # Tabbed follow-up management
│   ├── IdleAlertBanner.jsx              # Fixed bottom alerts
│   ├── ActionMenu.jsx                   # Dropdown menu component
│   ├── StatusBadge.jsx                  # Live status indicator
│   ├── ReassignModal.jsx                # Reassign donor modal
│   ├── FollowupDateModal.jsx            # Date picker modal
│   └── VerifyPaymentModal.jsx           # Payment verification
├── hooks/
│   ├── useTLDashboard.js                # Main data fetching + polling
│   ├── useRealtimeStats.js              # Supabase realtime subscription
│   └── useIdleAlerts.js                 # Idle alert polling
└── store.jsx                            # Zustand store for dashboard state
```

---

## 🎯 Implementation Priority

| Priority | Component | Dependencies |
|----------|-----------|--------------|
| **P0** | Backend APIs (`tl-dashboard`, `donation-funnel`, `hourly-performance`, `followups`, `idle-alerts`) | DB views |
| **P0** | `useTLDashboard` hook + `Dashboard.jsx` skeleton | APIs |
| **P0** | `KPICard`, `DonationFunnel`, `HourlyPerformanceChart` | Hook |
| **P0** | `TelecallerTable` with inline actions | Hook, `ActionMenu` |
| **P0** | `FollowupManager` with tabs + modals | Hook, `followups` API |
| **P0** | `IdleAlertBanner` + FRO activity tracking | `idle-alerts` API, `useActivityTracking` |
| **P1** | `TopBottomPerformers` | Hook |
| **P1** | `CallAnalytics` enhancement | Existing |
| **P1** | `FroLiveStatus` idle detection | FRO activity tracking |
| **P2** | Export CSV (hourly, table) | Chart data |
| **P2** | Animations & polish | All components |

---

## 📝 Notes for Developers

1. **Zero "Promised" References**: Ensure no `promise_to_pay`, `payment_pending`, or "promised" strings appear in UI
2. **Verified Only**: All amount fields use `accounts_status = 'verified'` filter
3. **Performance**: Memoize chart components, virtualize table rows (>100)
4. **Error Boundaries**: Wrap each chart/widget in ErrorBoundary
5. **Loading States**: Skeleton loaders for each section (reuse `SkeletonDashboard`)
6. **Empty States**: Friendly illustrations + action buttons when no data
7. **Testing**: Unit test calculations, integration test API contracts, e2e test user flows