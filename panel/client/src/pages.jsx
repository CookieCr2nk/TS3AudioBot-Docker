import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./auth.jsx";

function useLoad(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let stop = false;
    setError("");
    api(path)
      .then((value) => {
        if (!stop) setData(value);
      })
      .catch((err) => {
        if (!stop) setError(err.message);
      });
    return () => {
      stop = true;
    };
  }, [path, tick]);
  return { data, error, setData, reload: () => setTick((value) => value + 1) };
}

function Notice({ error, note }) {
  if (error) return <p className="flash flash-error" role="alert">{error}</p>;
  if (note) return <p className="flash flash-ok" role="status">{note}</p>;
  return null;
}

export function Login() {
  const { signIn, t } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await signIn(username, password);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>TS3 Panel</h1>
        <p className="muted">{t("Sign in")}</p>
        <Notice error={error} />
        <label>{t("Username")}
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label>{t("Password")}
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn btn-primary" type="submit">{t("Sign in")}</button>
      </form>
    </main>
  );
}

export function Overview() {
  const { t } = useAuth();
  const location = useLocation();
  const { data, error } = useLoad("/api/overview");
  return (
    <div className="page">
      <h1>{t("Overview")}</h1>
      <Notice error={error} note={location.state?.note || ""} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("Name")}</th>
              <th>{t("Status")}</th>
              <th>{t("Bots")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.cards || []).map((card) => (
              <tr key={card.id}>
                <td>
                  {card.name}
                  {card.ownerName ? <div className="muted">{card.ownerName}</div> : null}
                </td>
                <td>
                  <span className={card.online ? "pill pill-ok" : "pill pill-bad"}>{card.online ? t("Connected") : t("Offline")}</span>
                  {card.version ? <div className="muted mono">{card.version}</div> : null}
                  {card.error ? <div className="muted">{card.error}</div> : null}
                </td>
                <td>{card.botCount}</td>
                <td><Link className="btn" to={`/instances/${card.id}`}>{t("Open")}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function InstancePage() {
  const { id } = useParams();
  const { user, t } = useAuth();
  const navigate = useNavigate();
  const { data, error, reload } = useLoad(`/api/instances/${id}`);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const instance = data?.instance;

  async function run(path, body, after) {
    setFormError("");
    setNote("");
    try {
      const result = await api(path, { method: "POST", body });
      setNote(result.message || "");
      if (after) after(result);
      else reload();
      return result;
    } catch (err) {
      setFormError(err.message);
      return null;
    }
  }

  async function saveInstance(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const grants = (data.users || [])
      .filter((account) => account.role !== "admin" && String(account.id) !== form.get("ownerUserId"))
      .filter((account) => form.get(`grant_${account.id}`) === "on")
      .map((account) => ({ userId: account.id, canControl: form.get(`control_${account.id}`) === "on" }));
    const result = await run(`/api/admin/instances/${id}`, {
      name: form.get("name"),
      baseUrl: form.get("baseUrl"),
      ownerUserId: form.get("ownerUserId"),
      apiUser: form.get("apiUser"),
      apiToken: form.get("apiToken"),
      clearToken: form.get("clearToken") === "on",
      notes: form.get("notes"),
      enabled: form.get("enabled") === "on",
      grants,
    });
    if (result) event.currentTarget.querySelector("input[name=apiToken]").value = "";
  }

  if (!instance && error) return <div className="page"><Notice error={error} /></div>;
  if (!instance) return null;

  return (
    <div className="page">
      <div>
        <h1>{instance.name}</h1>
        <p className="muted">{t("TeamSpeak bots on this instance. The panel does not start the container.")}</p>
        {instance.baseUrl ? <p className="mono">{instance.baseUrl}</p> : null}
      </div>
      <Notice error={formError || error} note={note} />

      {data.canManage ? (
        <form className="card" onSubmit={(event) => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get("name");
          run(`/api/instances/${id}/bots`, { name }, (result) => navigate(`/bots/${result.botId}`));
        }}>
          <h2>{t("Create a bot")}</h2>
          <div className="split">
            <label className="grow">{t("Name")}
              <input name="name" required maxLength={64} pattern="[A-Za-z0-9_.\-]+" placeholder="lobby" />
            </label>
            <button className="btn btn-primary" type="submit">{t("Create")}</button>
          </div>
        </form>
      ) : null}

      {data.canManage ? (
        <form className="card" onSubmit={(event) => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get("name");
          run(`/api/instances/${id}/bots/attach`, { name }, (result) => navigate(`/bots/${result.botId}`));
        }}>
          <h2>{t("Add existing template")}</h2>
          <div className="split">
            <label className="grow">{t("Name")}
              <input name="name" required maxLength={64} pattern="[A-Za-z0-9_.\-]+" placeholder="default" />
            </label>
            <button className="btn" type="submit">{t("Attach")}</button>
          </div>
        </form>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Name")}</th><th></th></tr></thead>
          <tbody>
            {(data.bots || []).map((bot) => (
              <tr key={bot.id}>
                <td>{bot.name}</td>
                <td className="inline">
                  <Link className="btn" to={`/bots/${bot.id}`}>{t("Open")}</Link>
                  {data.canManage ? (
                    <form className="inline" onSubmit={(event) => {
                      event.preventDefault();
                      const confirm = new FormData(event.currentTarget).get("confirm");
                      run(`/api/instances/${id}/bots/delete`, { name: bot.name, confirm });
                    }}>
                      <input name="confirm" required maxLength={64} placeholder={t("Type the bot name to confirm")} aria-label={t("Type the bot name to confirm")} />
                      <button className="btn btn-danger" type="submit">{t("Delete")}</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {user.role === "admin" ? (
        <form className="card" onSubmit={saveInstance}>
          <h2>{t("Settings")}</h2>
          <p className="muted">{t("On the Compose network the API address is enough. A token is stored encrypted only if you enter one.")}</p>
          <label>{t("Display name")}<input name="name" required maxLength={120} defaultValue={instance.name} /></label>
          <label>{t("API address")}<input name="baseUrl" required maxLength={255} defaultValue={instance.baseUrl} /></label>
          <label>{t("Owner")}
            <select name="ownerUserId" defaultValue={instance.ownerUserId || ""}>
              <option value="">{t("No owner")}</option>
              {(data.users || []).map((account) => <option key={account.id} value={account.id}>{account.username}</option>)}
            </select>
          </label>
          <div className="split">
            <label className="grow">{t("API UID")}<input name="apiUser" maxLength={128} defaultValue={instance.apiUser || ""} autoComplete="off" /></label>
            <label className="grow">{t("API token")}<input name="apiToken" type="password" maxLength={512} autoComplete="off" placeholder={instance.hasToken ? t("Leave blank to keep the saved token") : t("optional, or uid:token")} /></label>
          </div>
          {instance.hasToken ? <label className="check"><input type="checkbox" name="clearToken" value="on" /> {t("Remove saved token")}</label> : null}
          <label>{t("Note")}<textarea name="notes" maxLength={500} rows={3} defaultValue={instance.notes} /></label>
          <label className="check"><input type="checkbox" name="enabled" value="on" defaultChecked={instance.enabled} /> {t("Instance is enabled")}</label>
          <h2>{t("Grants")}</h2>
          {(data.users || []).filter((account) => account.role !== "admin" && String(account.id) !== String(instance.ownerUserId)).map((account) => {
            const grant = (data.grants || []).find((item) => item.userId === account.id);
            return (
              <div className="grant" key={account.id}>
                <label className="check"><input type="checkbox" name={`grant_${account.id}`} value="on" defaultChecked={Boolean(grant)} /> {account.username}</label>
                <label className="check"><input type="checkbox" name={`control_${account.id}`} value="on" defaultChecked={!grant || grant.canControl} /> {t("Control")}</label>
              </div>
            );
          })}
          <div className="transport">
            <button className="btn btn-primary" type="submit">{t("Save")}</button>
            <button className="btn" type="button" onClick={() => run(`/api/admin/instances/${id}/test`, {})}>{t("Check connection")}</button>
          </div>
        </form>
      ) : null}
      {user.role === "admin" ? (
        <form className="card" onSubmit={async (event) => {
          event.preventDefault();
          const confirm = new FormData(event.currentTarget).get("confirm");
          setFormError("");
          setNote("");
          try {
            const result = await api(`/api/admin/instances/${id}`, { method: "DELETE", body: { confirm } });
            navigate("/", { state: { note: result.message } });
          } catch (err) {
            setFormError(err.message);
          }
        }}>
          <h2>{t("Delete instance")}</h2>
          <label>{t("Type the instance name to confirm")}<input name="confirm" required maxLength={120} /></label>
          <button className="btn btn-danger" type="submit">{t("Delete")}</button>
        </form>
      ) : null}
    </div>
  );
}

function useBotAction(botId) {
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  async function act(body) {
    setError("");
    setNote("");
    try {
      const result = await api(`/api/bots/${botId}/action`, { method: "POST", body });
      if (result.redirect) navigate(result.redirect);
      else if (result.botId) navigate(`/bots/${result.botId}`);
      else setNote(result.message || "");
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }
  return { note, error, act, setNote, setError };
}

export function Playback() {
  const { id } = useParams();
  const { t } = useAuth();
  const { note, error, act } = useBotAction(id);
  const [status, setStatus] = useState(null);
  const [query, setQuery] = useState("");
  const [factory, setFactory] = useState("youtube");
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [volume, setVolume] = useState(50);

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const data = await api(`/api/bots/${id}/status`);
        if (stop) return;
        setStatus(data.status);
        if (data.status?.volume != null && document.activeElement?.dataset?.volume !== "1") setVolume(data.status.volume);
      } catch (err) {
        if (!stop) setStatus({ problems: [err.message], song: null });
      }
    }
    pull();
    const timer = window.setInterval(pull, 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [id]);

  const song = status?.song;
  return (
    <div className="page">
      <h1>{t("Playback")}</h1>
      <Notice error={error} note={note} />
      {(status?.problems || []).map((problem) => <p key={problem} className="flash flash-error">{problem}</p>)}
      <section className="card">
        <div className="split">
          <h2>{song?.title || t("Nothing is playing.")}</h2>
          <span className="pill">{song ? (song.paused ? t("Paused") : t("Playing")) : t("Empty")}</span>
        </div>
        <p className="muted">{song?.source || ""}</p>
        <div className="meter" aria-hidden="true"><span style={{ width: `${song?.progress || 0}%` }} /></div>
        <p className="mono">{song?.positionLabel || "0:00"} / {song?.lengthLabel || "--:--"}</p>
        <div className="transport">
          <button className="btn" type="button" onClick={() => act({ op: "previous" })}>{t("Previous")}</button>
          <button className="btn btn-primary" type="button" onClick={() => act({ op: song && !song.paused ? "pause" : "resume" })}>
            {song && !song.paused ? t("Pause") : t("Resume")}
          </button>
          <button className="btn" type="button" onClick={() => act({ op: "next" })}>{t("Skip")}</button>
          <button className="btn" type="button" onClick={() => window.confirm(t("Stop playback?")) && act({ op: "stop" })}>{t("Stop")}</button>
          <button className="btn btn-danger" type="button" onClick={() => window.confirm(t("Clear the queue?")) && act({ op: "clear" })}>{t("Clear")}</button>
        </div>
        <div className="transport">
          {[-30, -10, 10, 30].map((delta) => (
            <button key={delta} className="btn" type="button" onClick={() => act({ op: "nudge", delta })}>
              {delta > 0 ? `+${delta}` : delta}s
            </button>
          ))}
        </div>
        <label>{t("Volume")}
          <input data-volume="1" type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} onPointerUp={() => act({ op: "volume", volume })} />
        </label>
      </section>
      {status?.queue?.items?.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>{status.queue.title || t("Queue")}</th></tr></thead>
            <tbody>
              {status.queue.items.map((item) => (
                <tr key={item.index}>
                  <td className="mono">{item.index}</td>
                  <td>{item.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        setSearchError("");
        try {
          const data = await api(`/api/bots/${id}/search?q=${encodeURIComponent(query)}&factory=${factory}`);
          setResults(data.results || []);
        } catch (err) {
          setResults([]);
          setSearchError(err.message);
        }
      }}>
        <h2>{t("Search")}</h2>
        <Notice error={searchError} />
        <div className="split">
          <label className="grow">{t("Search term")}
            <input value={query} onChange={(event) => setQuery(event.target.value)} required />
          </label>
          <label>{t("Source")}
            <select value={factory} onChange={(event) => setFactory(event.target.value)}>
              <option value="youtube">youtube</option>
              <option value="soundcloud">soundcloud</option>
              <option value="twitch">twitch</option>
              <option value="media">media</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit">{t("Search")}</button>
        </div>
        {results.map((item) => (
          <div className="split" key={`${item.index}-${item.title}`}>
            <span className="grow">{item.title}</span>
            <button className="btn" type="button" onClick={() => act({ op: "search-play", index: item.index })}>{t("Play")}</button>
            <button className="btn" type="button" onClick={() => act({ op: "search-add", index: item.index })}>{t("Append")}</button>
          </div>
        ))}
      </form>
    </div>
  );
}

export function Playlists() {
  const { id } = useParams();
  const { t } = useAuth();
  const { data, error } = useLoad(`/api/bots/${id}/playlists`);
  return (
    <div className="page">
      <h1>{t("Playlists")}</h1>
      <Notice error={error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Name")}</th><th></th></tr></thead>
          <tbody>
            {(data?.lists || []).map((list) => (
              <tr key={list.id}>
                <td>{list.title}{list.count != null ? <span className="muted"> · {list.count}</span> : null}</td>
                <td><Link className="btn" to={`/bots/${id}/playlists/${encodeURIComponent(list.id)}`}>{t("Open")}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Playlist() {
  const { id, listId } = useParams();
  const { t } = useAuth();
  const { note, error, act } = useBotAction(id);
  const { data, error: loadError } = useLoad(`/api/bots/${id}/playlists/${listId}`);
  return (
    <div className="page">
      <h1>{data?.playlist?.title || t("Playlists")}</h1>
      <Notice error={error || loadError} note={note} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>{t("Name")}</th><th></th></tr></thead>
          <tbody>
            {(data?.playlist?.items || []).map((item) => (
              <tr key={item.index}>
                <td className="mono">{item.index}</td>
                <td>{item.title}</td>
                <td><button className="btn" type="button" onClick={() => act({ op: "list-play", listId, index: item.index })}>{t("Play from here")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Radio() {
  const { id } = useParams();
  const { user, t } = useAuth();
  const { data, error, reload } = useLoad(`/api/bots/${id}/streams`);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  async function call(path, options) {
    setFormError("");
    try {
      const result = await api(path, options);
      setNote(result.message || "");
      return result;
    } catch (err) {
      setFormError(err.message);
      return null;
    }
  }
  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFormError("");
    try {
      const result = await api(`/api/bots/${id}/streams`, {
        method: "POST",
        body: { name: form.get("name"), url: form.get("url"), notes: form.get("notes"), shared: form.get("shared") === "on" },
      });
      setNote(result.message);
      event.currentTarget.reset();
      reload();
    } catch (err) {
      setFormError(err.message);
    }
  }
  return (
    <div className="page">
      <h1>{t("Radio")}</h1>
      <Notice error={formError || error} note={note} />
      <form className="card" onSubmit={save}>
        <h2>{t("New station")}</h2>
        <label>{t("Name")}<input name="name" required maxLength={80} /></label>
        <label>{t("Stream address")}<input name="url" required placeholder="https://" /></label>
        <label>{t("Note")}<input name="notes" maxLength={500} /></label>
        {user.role === "admin" ? <label className="check"><input type="checkbox" name="shared" value="on" /> {t("Shared catalog")}</label> : null}
        <button className="btn btn-primary" type="submit">{t("Save")}</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Name")}</th><th>{t("Stream address")}</th><th></th></tr></thead>
          <tbody>
            {(data?.streams || []).map((stream) => (
              <tr key={stream.id}>
                <td>{stream.name}{stream.shared ? <span className="pill">{t("Shared")}</span> : null}</td>
                <td className="mono">{stream.displayUrl}</td>
                <td className="inline">
                  <button className="btn btn-primary" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}/play`, { method: "POST", body: { op: "play" } })}>{t("Play")}</button>
                  <button className="btn" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}/play`, { method: "POST", body: { op: "add" } })}>{t("Add to queue")}</button>
                  {stream.canDelete ? <button className="btn btn-danger" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}`, { method: "DELETE", body: {} }).then((result) => { if (result) reload(); })}>{t("Delete")}</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function History() {
  const { id } = useParams();
  const { t } = useAuth();
  const [query, setQuery] = useState("");
  const [path, setPath] = useState(`/api/bots/${id}/history`);
  const { data, error } = useLoad(path);
  const { note, error: actionError, act } = useBotAction(id);
  return (
    <div className="page">
      <h1>{t("History")}</h1>
      <Notice error={error || actionError} note={note} />
      <form className="card" onSubmit={(event) => {
        event.preventDefault();
        setPath(`/api/bots/${id}/history?q=${encodeURIComponent(query)}`);
      }}>
        <div className="split">
          <label className="grow">{t("Title contains")}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <button className="btn" type="submit">{t("Search")}</button>
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Name")}</th><th></th></tr></thead>
          <tbody>
            {(data?.rows || []).map((row, index) => (
              <tr key={`${row.id}-${index}`}>
                <td>{row.title}<div className="muted">{row.meta}</div></td>
                <td>{row.id != null ? <button className="btn" type="button" onClick={() => act({ op: "history-play", historyId: row.id })}>{t("Play")}</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Connection() {
  const { id } = useParams();
  const { t } = useAuth();
  const { data, error, reload } = useLoad(`/api/bots/${id}/connection`);
  const { note, error: actionError, act } = useBotAction(id);
  const [localNote, setLocalNote] = useState("");
  if (!data && !error) return <div className="page"><h1>{t("Connection")}</h1></div>;
  return (
    <div className="page">
      <h1>{t("Connection")}</h1>
      <p className="muted">{t("Saved on the bot template. Empty fields stay unchanged. Passwords are sent to the bot and are not stored in the panel.")}</p>
      <Notice error={error || actionError} note={note || localNote} />
      <form className="card" key={data?.hosting?.name || "hosting"} onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const result = await act({
          op: "template-hosting",
          name: form.get("name"),
          nickname: form.get("nickname"),
          channel: form.get("channel"),
          serverPassword: form.get("serverPassword"),
          channelPassword: form.get("channelPassword"),
          bitrate: form.get("bitrate"),
          run: form.get("run"),
        });
        if (result) {
          setLocalNote(result.message || "");
          event.currentTarget.querySelectorAll("input[type=password]").forEach((input) => { input.value = ""; });
        }
      }}>
        <h2>{t("Connection settings")}</h2>
        <div className="split">
          <label>{t("Name")}<input name="name" required maxLength={64} pattern="[A-Za-z0-9_.\-]+" defaultValue={data?.hosting?.name || ""} /></label>
          <label className="grow">{t("Nickname")}<input name="nickname" maxLength={30} placeholder="Music" /></label>
        </div>
        <label>{t("Default channel")}<input name="channel" maxLength={200} placeholder={t("/5 or Home/Lobby")} /></label>
        <div className="split">
          <label className="grow">{t("Server password")}<input name="serverPassword" type="password" autoComplete="off" /></label>
          <label className="grow">{t("Channel password")}<input name="channelPassword" type="password" autoComplete="off" /></label>
        </div>
        <div className="split">
          <label>{t("Bitrate")}<input name="bitrate" inputMode="numeric" placeholder="96" /></label>
          <label>{t("Start when the process launches")}
            <select name="run" defaultValue="">
              <option value="">{t("Leave unchanged")}</option>
              <option value="on">{t("Yes")}</option>
              <option value="off">{t("No")}</option>
            </select>
          </label>
        </div>
        <button className="btn btn-primary" type="submit">{t("Save")}</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Name")}</th><th>{t("Server")}</th><th>{t("Status")}</th><th></th></tr></thead>
          <tbody>
            {(data?.instances || []).map((item) => (
              <tr key={`${item.id}-${item.name}`}>
                <td>{item.name || "—"}{item.current ? <span className="pill pill-ok">{t("Active")}</span> : null}</td>
                <td>
                  {item.name && item.status === "offline" ? (
                    <form className="inline" onSubmit={(event) => {
                      event.preventDefault();
                      act({ op: "template-address", name: item.name, address: new FormData(event.currentTarget).get("address") }).then(() => reload());
                    }}>
                      <input name="address" defaultValue={item.server || ""} required maxLength={200} />
                      <button className="btn" type="submit">{t("Save")}</button>
                    </form>
                  ) : item.server || "—"}
                </td>
                <td><span className={`pill pill-${item.status === "connected" ? "ok" : item.status === "connecting" ? "warn" : "bad"}`}>{item.statusLabel}</span></td>
                <td className="inline">
                  {item.name && item.status === "offline" ? <button className="btn" type="button" onClick={() => act({ op: "connect", name: item.name }).then(() => reload())}>{t("Start")}</button> : null}
                  {item.id != null ? <button className="btn btn-danger" type="button" onClick={() => window.confirm(t("Disconnect this instance?")) && act({ op: "disconnect", instanceId: item.id }).then(() => reload())}>{t("Disconnect")}</button> : null}
                  <button className="btn" type="button" onClick={() => act({ op: "use-instance", name: item.name, instanceId: item.id ?? "" })}>{t("Open")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card" onSubmit={(event) => {
        event.preventDefault();
        act({ op: "bot-setup", key: new FormData(event.currentTarget).get("key") }).then((result) => {
          if (result) event.currentTarget.reset();
        });
      }}>
        <h2>{t("Privilege key")}</h2>
        <p className="muted">{t("Paste a TeamSpeak privilege key once. It applies to the instance currently used for playback. The key is not stored.")}</p>
        <label>{t("Privilege key")}<input name="key" required autoComplete="off" /></label>
        <button className="btn" type="submit">{t("Apply")}</button>
      </form>
    </div>
  );
}

export function Users() {
  const { user, t } = useAuth();
  const { data, error, setData } = useLoad("/api/admin/users");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  if (user.role !== "admin") return <p className="flash flash-error">{t("Administrators only")}</p>;
  async function post(path, body) {
    setFormError("");
    const result = await api(path, { method: "POST", body });
    setNote(result.message || "");
    if (result.users) setData({ users: result.users });
    if (result.signedOut) window.location.assign("/login");
    return result;
  }
  return (
    <div className="page">
      <h1>{t("Users")}</h1>
      <p className="muted">{t("Panel accounts. These are not TeamSpeak identities.")}</p>
      <Notice error={formError || error} note={note} />
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await post("/api/admin/users", { username: form.get("username"), password: form.get("password"), role: form.get("role") });
          event.currentTarget.reset();
        } catch (err) {
          setFormError(err.message);
        }
      }}>
        <h2>{t("Create")}</h2>
        <div className="split">
          <label>{t("Username")}<input name="username" required maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,31}" autoComplete="off" /></label>
          <label>{t("Password")}<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
          <label>{t("Role")}
            <select name="role" defaultValue="user">
              <option value="user">{t("User")}</option>
              <option value="admin">{t("Administrator")}</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit">{t("Create")}</button>
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Name")}</th><th>{t("Role")}</th><th>{t("Status")}</th><th></th></tr></thead>
          <tbody>
            {(data?.users || []).map((account) => (
              <tr key={account.id}>
                <td>{account.username}</td>
                <td>
                  <form className="inline" onSubmit={async (event) => {
                    event.preventDefault();
                    try { await post(`/api/admin/users/${account.id}/role`, { role: new FormData(event.currentTarget).get("role") }); }
                    catch (err) { setFormError(err.message); }
                  }}>
                    <select name="role" defaultValue={account.role}>
                      <option value="user">{t("User")}</option>
                      <option value="admin">{t("Administrator")}</option>
                    </select>
                    <button className="btn" type="submit">{t("Save")}</button>
                  </form>
                </td>
                <td>
                  <span className={account.suspended ? "pill pill-bad" : "pill pill-ok"}>{account.suspended ? t("Suspended") : t("Active")}</span>
                  {account.id !== user.id ? (
                    <button className="btn" type="button" onClick={async () => {
                      try { await post(`/api/admin/users/${account.id}/suspend`, { suspended: !account.suspended }); }
                      catch (err) { setFormError(err.message); }
                    }}>{account.suspended ? t("Restore") : t("Suspend")}</button>
                  ) : null}
                </td>
                <td className="inline">
                  <form className="inline" onSubmit={async (event) => {
                    event.preventDefault();
                    try {
                      await post(`/api/admin/users/${account.id}/password`, { password: new FormData(event.currentTarget).get("password") });
                      event.currentTarget.reset();
                    } catch (err) { setFormError(err.message); }
                  }}>
                    <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder={t("New password")} />
                    <button className="btn" type="submit">{t("Set")}</button>
                  </form>
                  {account.id !== user.id ? (
                    <button className="btn btn-danger" type="button" onClick={async () => {
                      if (!window.confirm(t("Delete"))) return;
                      try { await api(`/api/admin/users/${account.id}`, { method: "DELETE", body: { confirm: true } }).then((result) => { setNote(result.message); setData({ users: result.users }); }); }
                      catch (err) { setFormError(err.message); }
                    }}>{t("Remove")}</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Audit() {
  const { user, t } = useAuth();
  const { data, error } = useLoad("/api/admin/audit");
  if (user.role !== "admin") return <p className="flash flash-error">{t("Administrators only")}</p>;
  return (
    <div className="page">
      <h1>{t("Audit")}</h1>
      <Notice error={error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Time")}</th><th>{t("Name")}</th><th>{t("Action")}</th><th>{t("Detail")}</th></tr></thead>
          <tbody>
            {(data?.rows || []).map((row, index) => (
              <tr key={`${row.createdAt}-${index}`}>
                <td className="mono">{row.createdAt ? new Date(row.createdAt).toLocaleString() : ""}</td>
                <td>{row.username}</td>
                <td>{row.action}</td>
                <td>{row.detail}{row.botName ? <div className="muted">{row.botName}</div> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Account() {
  const { t } = useAuth();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="page">
      <h1>{t("Account")}</h1>
      <Notice error={error} note={note} />
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError("");
        try {
          const result = await api("/api/account/password", {
            method: "POST",
            body: { current: form.get("current"), password: form.get("password"), confirm: form.get("confirm") },
          });
          setNote(result.message);
          event.currentTarget.reset();
        } catch (err) {
          setError(err.message);
        }
      }}>
        <h2>{t("Password")}</h2>
        <label>{t("Current password")}<input name="current" type="password" required autoComplete="current-password" /></label>
        <label>{t("New password")}<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
        <label>{t("Confirm")}<input name="confirm" type="password" required minLength={10} autoComplete="new-password" /></label>
        <button className="btn btn-primary" type="submit">{t("Change password")}</button>
      </form>
    </div>
  );
}
