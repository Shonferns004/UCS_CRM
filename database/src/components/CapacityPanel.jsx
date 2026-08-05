const capFmt = (n, d = 1) => n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
const capGB = (n) => n == null ? null : Number(n) / 1024;

function CapCard({ lbl, val, sub, pct, cls }) {
  return (
    <div className="cap-card">
      <div className="lbl">{lbl}</div>
      <div className="val">{val}</div>
      {sub && <div className="sub">{sub}</div>}
      {pct != null && (
        <div className={`bar${cls ? ' ' + cls : ''}`}>
          <i style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}></i>
        </div>
      )}
    </div>
  );
}

export default function CapacityPanel({ open, data, onRefresh }) {
  if (!open) return null;
  return (
    <div className="mx-md my-md border border-border-subtle rounded bg-surface-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2 bg-surface-container-high border-b border-border-subtle">
        <span className="font-headline-md text-headline-md font-bold text-on-surface">Shon RDS</span>
        {data && data.sampledAt && (
          <span className="font-body-sm text-body-sm text-on-surface-variant font-normal">sampled {new Date(data.sampledAt).toLocaleString()}</span>
        )}
        <span className="flex-1"></span>
        <button onClick={onRefresh} className="px-2.5 py-1 rounded border border-border-subtle bg-surface text-on-surface font-body-sm text-body-sm hover:border-primary hover:text-primary transition-colors cursor-pointer">
          Refresh
        </button>
      </div>

      {!data ? (
        <div className="cap-err">Loading…</div>
      ) : data.error ? (
        <div className="cap-err">{data.error}</div>
      ) : !data.ok || !data.instance ? (
        <div className="cap-err">{data.reason || 'Failed to load RDS capacity'}</div>
      ) : (
        <>
          <div className="px-3 py-2 border-b border-border-subtle font-body-sm text-body-sm text-on-surface-variant flex gap-3.5 flex-wrap">
            {[
              `Instance: <b>${data.instance.identifier}</b>`,
              `Class: <b>${data.instance.class}</b>`,
              `Engine: <b>${data.instance.engine} ${data.instance.engineVersion}</b>`,
              `Storage: <b>${data.instance.storageType}</b>`,
              `Status: <b>${data.instance.status}</b>`,
              data.instance.multiAZ ? 'Multi-AZ' : 'Single-AZ',
              data.instance.storageThroughput ? `Throughput: <b>${capFmt(data.instance.storageThroughput)}</b> MB/s` : '',
            ].filter(Boolean).map((h, i) => <span key={i} dangerouslySetInnerHTML={{ __html: h }} />)}
          </div>

          <div className="cap-grid">
            {(() => {
              const m = data.metrics;
              const cards = [];

              const cpu = m.cpu;
              cards.push(
                <CapCard
                  key="cpu"
                  lbl="CPU Utilization"
                  val={(cpu.average != null ? capFmt(cpu.average) : '—') + '%'}
                  sub={`max ${cpu.maximum != null ? capFmt(cpu.maximum) + '%' : '—'}${cpu.samples ? ` · ${cpu.samples} samples` : ''}`}
                  pct={cpu.average}
                  cls={cpu.average > 80 ? 'bad' : cpu.average > 60 ? 'warn' : ''}
                />
              );

              const fs = m.freeStorage;
              if (fs.freeGB != null && fs.allocatedGB) {
                cards.push(
                  <CapCard
                    key="storage"
                    lbl="Storage Used"
                    val={`${capFmt(fs.usedGB)} / ${capFmt(fs.allocatedGB)} GB`}
                    sub={`${capFmt(fs.freeGB)} GB free (${capFmt(fs.pctUsed, 0)}% used)`}
                    pct={fs.pctUsed}
                    cls={fs.pctUsed > 85 ? 'bad' : fs.pctUsed > 70 ? 'warn' : ''}
                  />
                );
              } else {
                cards.push(<CapCard key="storage" lbl="Storage Used" val="—" sub="no data" />);
              }

              const mem = m.freeableMemory;
              cards.push(
                <CapCard
                  key="mem"
                  lbl="Free Memory"
                  val={mem.averageMB != null ? capFmt(capGB(mem.averageMB)) + ' GB' : '—'}
                  sub={`max ${mem.maximumMB != null ? capFmt(capGB(mem.maximumMB)) + ' GB' : '—'}`}
                />
              );

              const conn = m.connections;
              cards.push(
                <CapCard
                  key="conn"
                  lbl="DB Connections"
                  val={conn.sum != null ? capFmt(conn.sum, 0) : '—'}
                  sub={`max ${conn.maximum != null ? capFmt(conn.maximum, 0) : '—'} (last 10 min)`}
                />
              );

              const rt = m.readThroughput, wt = m.writeThroughput;
              cards.push(<CapCard key="rt" lbl="Read Throughput" val={rt.averageKBS != null ? capFmt(rt.averageKBS) + ' KB/s' : '—'} sub="avg" />);
              cards.push(<CapCard key="wt" lbl="Write Throughput" val={wt.averageKBS != null ? capFmt(wt.averageKBS) + ' KB/s' : '—'} sub="avg" />);

              const rl = m.readLatency, wl = m.writeLatency;
              const ms = (v) => (v == null ? '—' : capFmt(v * 1000, 2) + ' ms');
              cards.push(<CapCard key="rl" lbl="Read Latency" val={ms(rl.average)} sub={`max ${ms(rl.maximum)}`} />);
              cards.push(<CapCard key="wl" lbl="Write Latency" val={ms(wl.average)} sub={`max ${ms(wl.maximum)}`} />);

              return cards;
            })()}
          </div>

          <div className="cap-note px-3 py-2.5 font-body-sm text-body-sm text-on-surface-variant">
            Shon RDS — metrics from CloudWatch (AWS/RDS), last ~10 min. Storage/memory in GB. Requires AWS credentials in backend <code className="text-primary">.env</code>.
          </div>
        </>
      )}
    </div>
  );
}
