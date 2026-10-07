// The content security policy the window gets under `tauri dev`, where
// Tauri applies none (it does not proxy the dev server on the desktop):
// the app's own policy from tauri.conf.json, plus what Vite's dev server
// needs. React's fast refresh runs one inline script, and hot reload talks
// over a WebSocket.

import tauriConf from "./src-tauri/tauri.conf.json" with { type: "json" };

type Policy = Record<string, string>;

/** The policy in tauri.conf.json. */
export function appCsp(): Policy {
  return tauriConf.app.security.csp;
}

/** The dev server's policy, with its hot reload at `port` (and `host`). */
export function devCsp(port: number, host?: string): string {
  const policy: Policy = { ...appCsp() };
  policy["script-src"] = "'self' 'unsafe-inline' 'wasm-unsafe-eval'";
  const sockets = [`ws://localhost:${port}`, `ws://127.0.0.1:${port}`];
  if (host) sockets.push(`ws://${host}:1421`);
  policy["connect-src"] = [policy["connect-src"] ?? "'self'", "'self'", ...sockets].join(" ");
  return Object.entries(policy)
    .map(([directive, sources]) => `${directive} ${sources}`)
    .join("; ");
}
