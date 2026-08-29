import { useMemo, useRef, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { Download, BarChart3 } from 'lucide-react';

const COLORS = {
  calls: '#dbeafe',
  connected: '#3b82f6',
  amount: '#16a34a',
};

export function HourlyPerformanceChart({ data, onExport, animate = true }) {
  const chartRef = useRef(null);

  const exportCSV = useMemo(() => {
    if (!data || !onExport) return () => {};
    return () => {
      const headers = ['Hour', 'Calls', 'Connected', 'Interested', 'Donations', 'Amount (₹)'];
      const rows = data.map(d => [
        d.hour,
        d.calls,
        d.connected,
        d.interested,
        d.donations,
        d.amount,
      ]);
      const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hourly-performance-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onExport?.();
    };
  }, [data, onExport]);

  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>No hourly data available</div>
      </div>
    );
  }

  const maxCalls = Math.max(...data.map(d => d.calls), 1);
  const maxAmount = Math.max(...data.map(d => d.amount), 1);

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 width="20" height="20" style={{ color: '#8b5cf6' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Hourly Performance (Today)</span>
        </div>
        <button 
          onClick={exportCSV}
          style={{ 
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 6, border: '1px solid var(--line)',
            background: 'transparent', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.15s'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--ink)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-soft)'; }}
        >
          <Download width="14" height="14" />
          Export CSV
        </button>
      </div>

      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart 
            data={data} 
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis 
              dataKey="hour" 
              tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
              tickFormatter={h => h.replace(':00-', '–')}
            />
            <YAxis 
              yAxisId="left"
              tick={{ fontSize: 10, fill: 'var(--ink-soft)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v}
              domain={[0, 'dataMax + 20%']}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: 'var(--ink-soft)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)}
              domain={[0, 'dataMax + 20%']}
            />
            <Tooltip 
              contentStyle={{ 
                background: '#fff', 
                border: '1px solid #e5e7eb', 
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--ink)', fontWeight: 600 }}
              formatter={(value, name) => {
                const labels = { calls: 'Calls', connected: 'Connected', interested: 'Interested', donations: 'Donations', amount: 'Amount' };
                return [value, labels[name] || name];
              }}
              itemStyle={{ cursor: 'default' }}
            />
            <Legend 
              layout="horizontal" 
              align="center" 
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ paddingTop: 8 }}
            />

            {/* Calls Bar */}
            <Bar
              yAxisId="left"
              dataKey="calls"
              name="Calls"
              fill={COLORS.calls}
              radius={[4, 4, 0, 0]}
              maxBarSize={30}
              barSize={20}
              animation={animate ? { duration: 800, easing: 'easeOutQuart' } : false}
            >
              <Cell fill={COLORS.calls} />
            </Bar>

            {/* Connected Bar */}
            <Bar
              yAxisId="left"
              dataKey="connected"
              name="Connected"
              fill={COLORS.connected}
              radius={[4, 4, 0, 0]}
              maxBarSize={30}
              barSize={20}
              animation={animate ? { duration: 800, easing: 'easeOutQuart' } : false}
            >
              <Cell fill={COLORS.connected} />
            </Bar>

            {/* Amount Line */}
            <Line
              yAxisId="right"
              dataKey="amount"
              name="Amount (₹)"
              stroke={COLORS.amount}
              strokeWidth={2.5}
              type="monotone"
              dot={{ r: 4, strokeWidth: 2, stroke: COLORS.amount, fill: '#fff' }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              animation={animate ? { duration: 1000, easing: 'easeOutQuart' } : false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend Summary */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-soft)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.calls }} />
          Calls
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-soft)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.connected }} />
          Connected
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-soft)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.amount }} />
          Amount (₹)
        </div>
      </div>
    </div>
  );
}

export default HourlyPerformanceChart;