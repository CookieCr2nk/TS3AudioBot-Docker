let csrf = "";
let signedOut = null;

// The auth provider registers this. A 401 means the server session is gone, so the UI returns to sign-in.
export function onSignedOut(listener) {
  signedOut = listener;
  return () => {
    if (signedOut === listener) signedOut = null;
  };
}

export function setCsrf(value) {
  csrf = value || "";
}

export async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" && csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    if (response.status === 401 && path !== "/api/login" && signedOut) signedOut();
    throw error;
  }
  return data;
}

export function makeT(phrases) {
  return (key, params) => {
    const template = Object.prototype.hasOwnProperty.call(phrases, key) ? phrases[key] : key;
    if (!params) return template;
    return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => {
      const value = params[name];
      return value === undefined || value === null ? match : String(value);
    });
  };
}
