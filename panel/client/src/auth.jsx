import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, makeT, setCsrf } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [phrases, setPhrases] = useState({});
  const [ready, setReady] = useState(false);

  async function refresh() {
    const data = await api("/api/session");
    setCsrf(data.csrf);
    setPhrases(data.phrases || {});
    setUser(data.user);
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
    setCsrf(data.csrf);
    setPhrases(data.phrases || {});
    setUser(data.user);
  }

  async function signOut() {
    await api("/api/logout", { method: "POST", body: {} });
    setCsrf("");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, ready, t, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
