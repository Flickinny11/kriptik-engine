/**
 * AI Lab — placeholder tab for Open Source Studio.
 * Will contain multi-agent research orchestration features.
 */

export function AILab() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      minHeight: 300,
      color: 'rgba(255,255,255,0.4)',
      fontSize: 14,
      fontFamily: 'inherit',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>AI Lab</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>Multi-agent research — coming soon</div>
      </div>
    </div>
  );
}
