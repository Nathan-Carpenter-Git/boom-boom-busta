// Every lobby has its own link, /ABCD. Opening it goes straight to joining that lobby, and while
// you're in a lobby the address bar shows its link, so copying the URL works too.

const CODE_PATH = /^\/([A-Za-z]{4})\/?$/;

/** The lobby code in the page address: /ABCD, or the older ?code=ABCD invite links. */
export function codeFromUrl(): string | null {
  const fromPath = CODE_PATH.exec(location.pathname)?.[1];
  const fromQuery = new URLSearchParams(location.search).get("code");
  const code = (fromPath ?? fromQuery ?? "").toUpperCase();
  return /^[A-Z]{4}$/.test(code) ? code : null;
}

export function lobbyLink(code: string): string {
  return `${location.origin}/${code}`;
}

/** Points the address bar at the lobby's link, or back home with null. */
export function showLobbyInUrl(code: string | null): void {
  const path = code ? `/${code}` : "/";
  if (location.pathname !== path || location.search) history.replaceState(null, "", path);
}

/** Copies text, falling back to a hidden textarea where the Clipboard API is missing (plain http). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}
