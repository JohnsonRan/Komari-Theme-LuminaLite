export function NodeCardSkeleton() {
  return (
    <div className="server-card skeleton-large" aria-busy>
      <div className="skeleton-large-header">
        <div className="skeleton-large-title">
          <span className="skeleton-block" style={{ width: "50%", height: 16 }} />
          <span className="skeleton-block" style={{ width: "72%", height: 22, borderRadius: 8 }} />
        </div>
        <span className="skeleton-block" style={{ width: 30, height: 30, borderRadius: 8 }} />
      </div>
      <div className="skeleton-large-metrics">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton-large-metric">
            <span className="skeleton-block" style={{ width: "60%", height: 11 }} />
            <span className="skeleton-block" style={{ width: "100%", height: 8, borderRadius: 4 }} />
            <span className="skeleton-block" style={{ width: "45%", height: 10 }} />
          </div>
        ))}
      </div>
      <div className="skeleton-large-traffic">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="skeleton-large-traffic-stat">
            <span className="skeleton-block" style={{ width: "55%", height: 11 }} />
            <span className="skeleton-block" style={{ width: "80%", height: 20 }} />
            <span className="skeleton-block" style={{ width: "100%", height: 10, borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div className="skeleton-large-health">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="skeleton-large-health-block">
            <span className="skeleton-block" style={{ width: "50%", height: 11 }} />
            <span className="skeleton-block" style={{ width: "100%", height: 16, borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div className="skeleton-large-footer">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="skeleton-large-metric">
            <span className="skeleton-block" style={{ width: "55%", height: 11 }} />
            <span className="skeleton-block" style={{ width: "70%", height: 15 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
