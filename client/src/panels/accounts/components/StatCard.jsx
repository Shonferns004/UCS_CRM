export default function StatCard({ label, value }) {
  return (
    <div className="wa-stat">
      <span className="wa-stat-label">{label}</span>
      <span className="wa-stat-value">{value}</span>
    </div>
  );
}
