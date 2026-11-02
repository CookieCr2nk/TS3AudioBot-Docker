import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, makeT, setCsrf } from "./api.js";
import { readLangCookie, writeLangCookie } from "./lang.js";

const AuthContext = createContext(null);

function applyDocumentLang(lang) {
  if (lang) document.documentElement.lang = lang;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [phrases, setPhrases] = useState({});
  const [languages, setLanguages] = useState([]);
  const [langChoice, setLangChoice] = useState(readLangCookie);
  const [ready, setReady] = useState(false);

  function applySession(data) {
    setCsrf(data.csrf);
    setPhrases(data.phrases || {});
    setUser(data.user);
    setLanguages(data.languages || []);
    setLangChoice(data.choice || "auto");
    applyDocumentLang(data.lang);
  }

  async function refresh() {
    const data = await api("/api/session");
    applySession(data);
    return data;
  }

  useEffect(() => {
    refresh()
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const t = useMemo(() => makeT(phrases), [phrases]);

  async function signIn(username, password) {
    const data = await api("/api/login", { method: "POST", body: { username, password } });
    applySession(data);
  }

  async function signOut() {
    await api("/api/logout", { method: "POST", body: {} });
    setCsrf("");
    setUser(null);
  }

  async function setLanguage(choice) {
    writeLangCookie(choice);
    setLangChoice(choice);
    try {
      await refresh();
    } catch {
      /* The cookie stays. The next session load uses it. */
    }
  }

  return (
    <AuthContext.Provider value={{ user, ready, t, languages, langChoice, setLanguage, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
