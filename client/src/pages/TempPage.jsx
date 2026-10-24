import React from 'react';

export default function TempPage() {
  return (
    <div style={{ padding: 24, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
      New-NetFirewallRule -DisplayName "Node.js WebSocket 5001" -Direction Inbound -Protocol TCP -LocalPort 5001 -Action Allow -Profile Private
    </div>
  );
}