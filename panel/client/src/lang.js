export const LANG_COOKIE = "ts3panel-lang";

export function readLangCookie() {
  const parts = document.cookie ? document.cookie.split("; ") : [];
  const hit = parts.find((part) => part.startsWith(`${LANG_COOKIE}=`));
  if (!hit) return "auto";
  try {
    return decodeURIComponent(hit.slice(LANG_COOKIE.length + 1)) || "auto";
  } catch {
    return "auto";
  }
}

export function writeLangCookie(choice) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LANG_COOKIE}=${encodeURIComponent(choice)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}
