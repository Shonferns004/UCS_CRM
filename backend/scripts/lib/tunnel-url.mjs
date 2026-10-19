// Returns the connection URL for the RDS host, rewritten to the local SSH
// tunnel (127.0.0.1:DB_TUNNEL_LOCAL_PORT) when a tunnel is answering there —
// the same rewrite every scripts/diag-*.mjs does. Some networks (office VPN,
// hosting providers) block the RDS IP outright; a live tunnel is the only path
// from those networks, while machines next to RDS (CI, the server) have no
// tunnel and keep the direct URL. Only the host and port change — credentials,
// database name and query options are untouched.
import net from 'node:net';

export async function viaTunnelIfUp(urlString) {
  if (!urlString) return urlString;
  const u = new URL(urlString);
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return urlString;

  const port = parseInt(process.env.DB_TUNNEL_LOCAL_PORT || '15432', 10);
  const up = await new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(1500, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
  if (!up) return urlString;

  u.hostname = '127.0.0.1';
  u.port = String(port);
  return u.toString();
}
