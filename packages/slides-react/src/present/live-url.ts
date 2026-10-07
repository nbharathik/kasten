// Which addresses an embedded page may be loaded from. A deck is a file that comes from anywhere, and a presentation
// runs its embeds for real, so only web addresses go in a frame: never a script, a local file or a page made of data.

/** The address as a web address a frame may load, or null when it is anything else. */
export function embedUrl(address: string | null | undefined): string | null {
  const text = (address ?? "").trim();
  if (text === "") return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** What the frame is allowed: scripts and its own storage, and nothing else (no forms, popups, top navigation, downloads or pointer lock). */
export const EMBED_SANDBOX = "allow-scripts allow-same-origin";

/**
 * What the frame for a page is allowed. A page from the origin of the page that shows it is not given its own storage: with scripts
 * and that, it could take its sandbox off and reach the page around it.
 */
export function embedSandbox(address: string, here: string | undefined = typeof location === "object" ? location.origin : undefined): string {
  try {
    return new URL(address).origin === here ? "allow-scripts" : EMBED_SANDBOX;
  } catch {
    return "allow-scripts";
  }
}

/** How long a page has to load before the poster stays. */
export const EMBED_SECONDS = 3;

/**
 * Whether something answers at the address. A page that refuses the connection still fills the frame with the
 * browser's own error page and says it loaded, so the poster would be hidden by it; asking first is how a dead
 * address is told from a live one. A policy that forbids the question (the app's) says nothing, so the page gets its chance.
 */
export async function answers(address: string, ask: typeof fetch | null = typeof fetch === "function" ? fetch : null): Promise<boolean> {
  if (!ask) return true;
  let forbidden = false;
  const note = () => {
    forbidden = true;
  };
  document.addEventListener("securitypolicyviolation", note);
  try {
    await ask(address, { mode: "no-cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    return true;
  } catch {
    // The report of a blocked request comes a moment after the request fails.
    await new Promise((done) => setTimeout(done, 0));
    return forbidden;
  } finally {
    document.removeEventListener("securitypolicyviolation", note);
  }
}
