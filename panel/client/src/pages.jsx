import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "./api.js";
import { ColumnFrame, ColumnTable, useColumns } from "./columns.jsx";
import { hostingChanges } from "./hostingForm.js";
import { useAuth } from "./auth.jsx";
import { LanguageSelect } from "./language.jsx";
import { usePlayer } from "./player.jsx";

function useLoad(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [loadedPath, setLoadedPath] = useState(path);
  if (loadedPath !== path) {
    setLoadedPath(path);
    setData(null);
    setError("");
  }
  useEffect(() => {
    let stop = false;
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

const PAGE_SIZES = [10, 25, 50, 100];

// Page buttons under a table. The page size select sits in the toolbar above it.
function Pager({ page, pages, onPage, total }) {
  const { t } = useAuth();
  return (
    <div className="table-foot">
      <span className="muted">{t("{count} entries", { count: total })}</span>
      <div className="transport">
        <button className="btn" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("Previous page")}</button>
        <span className="muted">{t("Page {page} of {pages}", { page, pages })}</span>
        <button className="btn" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t("Next page")}</button>
      </div>
    </div>
  );
}

function useToastDock() {
  const [dock, setDock] = useState(null);
  useLayoutEffect(() => {
    setDock(document.getElementById("toast-dock"));
  }, []);
  return dock;
}

export function Notice({ error, note }) {
  const dock = useToastDock();
  if (!error && !note) return null;
  const node = error
    ? <p className="flash flash-error" role="alert">{error}</p>
    : <p className="flash flash-ok" role="status">{note}</p>;
  return dock ? createPortal(node, dock) : node;
}

export function AddBot({ instanceId = "" }) {
  const { t } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [instances, setInstances] = useState(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(String(instanceId || ""));
  const choices = (instances || []).filter((item) => item.canCreate);

  useEffect(() => {
    if (instanceId) setPicked(String(instanceId));
  }, [instanceId]);

  useEffect(() => {
    if (!open) return undefined;
    let stop = false;
    api("/api/instances")
      .then((data) => {
        if (stop) return;
        const next = data.instances || [];
        setInstances(next);
        const allowed = next.filter((item) => item.canCreate);
        setPicked((current) => current || (instanceId ? String(instanceId) : (allowed[0] ? String(allowed[0].id) : "")));
      })
      .catch((err) => {
        if (!stop) setError(err.message);
      });
    return () => {
      stop = true;
    };
  }, [open]);

  if (!open) {
    return <button className="btn btn-plus" type="button" aria-label={t("Add bot")} onClick={() => { setError(""); setOpen(true); }}>+</button>;
  }
  return (
    <div className="add-pop">
    <form className="card add-card" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const target = String(form.get("instanceId") || picked);
      setError("");
      try {
        const result = await api(`/api/instances/${target}/bots`, { method: "POST", body: { name: form.get("name") } });
        navigate(`/bots/${result.botId}`);
      } catch (err) {
        setError(err.message);
      }
    }}>
      <h2>{t("Create a bot")}</h2>
      <Notice error={error || (instances && !choices.length ? t("You cannot create bots. Ask an administrator to assign one.") : "")} />
      <label>{t("Instance")}
        <select name="instanceId" value={picked} onChange={(event) => setPicked(event.target.value)} required>
          {choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <div className="split">
        <label className="grow">{t("Name")}<input name="name" required maxLength={120} placeholder="bot" /></label>
        <button className="btn btn-primary" type="submit" disabled={!choices.length}>{t("Create")}</button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>{t("Cancel")}</button>
      </div>
    </form>
    </div>
  );
}

function AddInstance() {
  const { t } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  if (!open) {
    return <button className="btn btn-plus" type="button" aria-label={t("Add instance")} onClick={() => { setError(""); setOpen(true); }}>+</button>;
  }
  return (
    <div className="add-pop">
    <form className="card add-card" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setError("");
      try {
        const result = await api("/api/admin/instances", {
          method: "POST",
          body: { name: form.get("name"), baseUrl: form.get("baseUrl"), enabled: "on" },
        });
        navigate(`/instances/${result.id}`);
      } catch (err) {
        setError(err.message);
      }
    }}>
      <h2>{t("Add instance")}</h2>
      <Notice error={error} />
      <label>{t("Display name")}<input name="name" required maxLength={120} /></label>
      <label>{t("API address")}<input name="baseUrl" required maxLength={255} placeholder="http://ts3audiobot:58913" /></label>
      <div className="inline">
        <button className="btn btn-primary" type="submit">{t("Save")}</button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>{t("Cancel")}</button>
      </div>
    </form>
    </div>
  );
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
        <div className="login-head">
          <div className="login-brand">
            <img src="/favicon.svg" alt="" />
            <h1>TS-Bot Panel</h1>
          </div>
          <LanguageSelect />
        </div>
        <p className="muted">{t("Management for bots, playback, and access.")}</p>
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

function boardWidth(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function StatusBoard({ summary, admin }) {
  const { t } = useAuth();
  const instances = summary.instances || { total: 0, online: 0, offline: 0, disabled: 0 };
  const bots = summary.bots || { registered: 0, running: 0, stopped: 0 };
  const accounts = summary.users;
  return (
    <section className={admin && accounts ? "board" : "board board-two"} aria-label={t("Dashboard")}>
      <article className="board-card">
        <div className="board-head">
          <h2>{t("Instances")}</h2>
          <span className={instances.online ? "pill pill-ok" : "pill"}>{instances.online ? t("Online") : t("Offline")}</span>
        </div>
        <p className="board-figure">
          <strong>{instances.online}</strong>
          <span>/{instances.total}</span>
        </p>
        <div className="meter" role="img" aria-label={t("{online} of {count} instances are online", { online: instances.online, count: instances.total })}>
          <span style={{ width: boardWidth(instances.online, instances.total) }} />
        </div>
        <ul className="board-rows">
          <li><span className="pill pill-ok">{t("Online")}</span><b>{instances.online}</b></li>
          <li><span className="pill pill-bad">{t("Offline")}</span><b>{instances.offline}</b></li>
          {admin ? <li><span className="pill">{t("Disabled")}</span><b>{instances.disabled}</b></li> : null}
        </ul>
      </article>
      <article className="board-card">
        <div className="board-head">
          <h2>{t("Bots")}</h2>
          <Link to="/bots">{t("Open")}</Link>
        </div>
        <p className="board-figure">
          <strong>{bots.running}</strong>
          <span>/{bots.registered}</span>
        </p>
        <div className="meter meter-ok" role="img" aria-label={t("{running} of {count} bots are running", { running: bots.running, count: bots.registered })}>
          <span style={{ width: boardWidth(bots.running, bots.registered) }} />
        </div>
        <ul className="board-rows">
          <li><span className="pill pill-ok">{t("Running")}</span><b>{bots.running}</b></li>
          <li><span className="pill pill-bad">{t("Stopped")}</span><b>{bots.stopped}</b></li>
          <li><span className="pill">{t("Registered")}</span><b>{bots.registered}</b></li>
        </ul>
        {admin && bots.process > bots.running ? (
          <p className="muted">{t("{count} connected in the container but not listed here", { count: bots.process })}</p>
        ) : null}
      </article>
      {admin && accounts ? (
        <article className="board-card">
          <div className="board-head">
            <h2>{t("Accounts")}</h2>
            <Link to="/users">{t("Open")}</Link>
          </div>
          <p className="board-figure">
            <strong>{accounts.active}</strong>
            <span>/{accounts.total}</span>
          </p>
          <div className="meter" role="img" aria-label={t("{active} of {count} accounts can sign in", { active: accounts.active, count: accounts.total })}>
            <span style={{ width: boardWidth(accounts.active, accounts.total) }} />
          </div>
          <ul className="board-rows">
            <li><span className="pill pill-ok">{t("Active")}</span><b>{accounts.active}</b></li>
            <li><span className="pill pill-bad">{t("Suspended")}</span><b>{accounts.suspended}</b></li>
            <li><span className="pill">{t("Administrators")}</span><b>{accounts.administrators}</b></li>
            <li><span className="pill pill-warn">{t("No password")}</span><b>{accounts.noPassword}</b></li>
          </ul>
        </article>
      ) : null}
    </section>
  );
}

export function Overview() {
  const { user, t } = useAuth();
  const location = useLocation();
  const { data, error } = useLoad("/api/overview");
  const cards = data?.cards || [];
  const summary = data?.summary;
  const overviewTable = useColumns("overview", [
    {
      id: "name",
      label: "Name",
      cell: (card) => (
        <>
          {card.name}
          {card.ownerName ? <div className="muted">{card.ownerName}</div> : null}
        </>
      ),
    },
    {
      id: "status",
      label: "Status",
      cell: (card) => (
        <>
          <span className={card.online ? "pill pill-ok" : "pill pill-bad"}>{card.online ? t("Connected") : t("Offline")}</span>
          {card.version ? <div className="muted mono">{card.version}</div> : null}
          {card.error ? <div className="muted">{card.error}</div> : null}
        </>
      ),
    },
    {
      id: "bots",
      label: "Bots",
      cell: (card) => (
        <>
          <Link to={`/bots?instance=${card.id}`} aria-label={t("Open in Bots")}>{t("{count} bots", { count: card.botCount })}</Link>
          <div className="muted">{t("{running} running", { running: card.running || 0 })}</div>
        </>
      ),
    },
    {
      id: "open",
      locked: "end",
      cell: (card) => <Link className="btn" to={`/instances/${card.id}`}>{t("Open")}</Link>,
    },
  ]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("Overview")}</h1>
          <p className="muted">{t("One row is one container. Open it to add TeamSpeak bots.")}</p>
        </div>
        <span className="inline">
          {user.role === "admin" ? <AddInstance /> : null}
          <Link className="btn btn-primary" to="/bots">{t("Bots")}</Link>
        </span>
      </div>
      <Notice error={error} note={location.state?.note || ""} />
      {summary ? <StatusBoard summary={summary} admin={user.role === "admin"} /> : null}
      {data && cards.length === 0 ? <p className="muted">{t("No instance has been added yet.")}</p> : null}
      {cards.length ? (
        <ColumnFrame picker={overviewTable.picker}>
          <ColumnTable columns={overviewTable.shown} rows={cards} rowKey={(card) => card.id} />
        </ColumnFrame>
      ) : null}
    </div>
  );
}

export function BotsPage() {
  const { user, t } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, error, reload } = useLoad("/api/bots");
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const allRef = useRef(null);
  const [dockSlot, setDockSlot] = useState(null);
  const bots = data?.bots || [];
  const instanceId = params.get("instance") || "";
  const instances = [];
  for (const bot of bots) {
    if (!instances.some((item) => item.id === bot.instanceId)) instances.push({ id: bot.instanceId, name: bot.instanceName || t("Instance") });
  }
  const filtered = bots.filter((bot) => {
    if (instanceId && String(bot.instanceId) !== instanceId) return false;
    if (query && !bot.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectable = visible.filter((bot) => bot.canControl);
  const allPicked = selectable.length > 0 && selectable.every((bot) => selected.includes(bot.id));
  const somePicked = selectable.some((bot) => selected.includes(bot.id));

  useEffect(() => {
    if (!data?.bots) return;
    const known = new Set(data.bots.map((bot) => bot.id));
    setSelected((current) => {
      const next = current.filter((id) => known.has(id));
      return next.length === current.length ? current : next;
    });
  }, [data]);

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = somePicked && !allPicked;
  }, [somePicked, allPicked]);

  useEffect(() => {
    setPage(1);
  }, [query, instanceId, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    setDockSlot(document.getElementById("bulk-slot"));
  }, []);

  function toggle(id) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleVisible() {
    setSelected((current) => {
      if (allPicked) return current.filter((id) => !selectable.some((bot) => bot.id === id));
      const next = new Set(current);
      for (const bot of selectable) next.add(bot.id);
      return [...next];
    });
  }

  async function apply(op) {
    if (!selected.length || busy) return;
    const ids = selected;
    setBusy(true);
    setFormError("");
    setNote("");
    try {
      const result = await api("/api/bots/bulk", { method: "POST", body: { ids, op } });
      const failed = (result.results || []).filter((item) => !item.ok);
      setSelected((current) => current.filter((id) => !ids.includes(id)));
      if (failed.length) {
        const detail = failed.map((item) => `${item.name || item.id}: ${item.message}`).filter(Boolean).join(" ");
        setFormError([result.message, detail].filter(Boolean).join(" "));
      } else {
        setNote(result.message || "");
      }
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function setInstance(value) {
    const next = new URLSearchParams(params);
    if (!value) next.delete("instance");
    else next.set("instance", value);
    setParams(next);
  }

  const botTable = useColumns("bots", [
    {
      id: "select",
      locked: "start",
      cellClass: "bot-check",
      header: () => (
        <input ref={allRef} type="checkbox" checked={allPicked} disabled={!selectable.length} aria-label={t("Select all")} onChange={toggleVisible} />
      ),
      cell: (bot) => (
        <input
          type="checkbox"
          checked={selected.includes(bot.id)}
          disabled={!bot.canControl}
          aria-label={t("Select {name}", { name: bot.name })}
          title={bot.canControl ? "" : t("Read only")}
          onChange={() => toggle(bot.id)}
        />
      ),
    },
    {
      id: "name",
      label: "Name",
      cellClass: "bot-name",
      cell: (bot) => <Link className="bot-clip" to={`/bots/${bot.id}`} title={bot.name}>{bot.name}</Link>,
    },
    {
      id: "owner",
      label: "Owner",
      cellClass: "owner",
      cell: (bot) => (user.role === "admin" ? (
        <select
          className="owner-select"
          aria-label={t("Owner")}
          key={`${bot.id}-${bot.assigneeUserId || "none"}`}
          defaultValue={bot.assigneeUserId || ""}
          onChange={async (event) => {
            const select = event.currentTarget;
            const next = select.value;
            const previous = String(bot.assigneeUserId || "");
            setFormError("");
            try {
              const result = await api(`/api/bots/${bot.id}/assignee`, {
                method: "POST",
                body: { userId: next },
              });
              setNote(result.message || "");
              reload();
            } catch (err) {
              select.value = previous;
              setFormError(err.message);
              reload();
            }
          }}
        >
          <option value="">{bot.instanceOwnerName ? t("Instance owner ({name})", { name: bot.instanceOwnerName }) : t("Instance owner")}</option>
          {(data.users || []).map((account) => <option key={account.id} value={account.id}>{account.username}</option>)}
        </select>
      ) : (bot.ownerName || t("No owner"))),
    },
    {
      id: "instance",
      label: "Instance",
      cell: (bot) => (bot.instanceId
        ? <Link className="bot-clip" to={`/instances/${bot.instanceId}`} title={bot.instanceName}>{bot.instanceName}</Link>
        : <span className="bot-clip" title={bot.instanceName}>{bot.instanceName}</span>),
    },
    {
      id: "status",
      label: "Status",
      cell: (bot) => {
        const playback = bot.playback;
        let status = t("Not playing");
        let pill = "pill";
        if (playback && !playback.online) {
          status = t("Offline");
          pill = "pill pill-bad";
        } else if (playback?.title && playback.paused === false) {
          status = t("Playing");
          pill = "pill pill-ok";
        } else if (playback?.title && playback.paused) {
          status = t("Paused");
          pill = "pill pill-warn";
        }
        const server = playback?.online && playback.server ? playback.server : bot.address;
        return (
          <>
            <span className={pill} title={playback?.error || ""}>{status}</span>
            {server ? <span className="mono muted bot-server" title={server}>{server}</span> : null}
          </>
        );
      },
    },
    {
      id: "playing",
      label: "Now playing",
      headerClass: "bot-playing",
      cellClass: "bot-playing",
      cell: (bot) => <span className="bot-clip" title={bot.playback?.title || ""}>{bot.playback?.title || "—"}</span>,
    },
    {
      id: "volume",
      label: "Volume",
      headerClass: "bot-volume",
      cellClass: "mono bot-volume",
      cell: (bot) => (bot.playback?.volume != null ? bot.playback.volume : "—"),
    },
    {
      id: "open",
      locked: "end",
      cellClass: "inline bot-actions",
      cell: (bot) => (
        <>
          <Link className="btn" to={`/bots/${bot.id}`}>{t("Open")}</Link>
          {bot.canDelete ? (
            <DeleteBot name={bot.name} onSubmit={async (confirm) => {
              setFormError("");
              try {
                const result = await api(`/api/instances/${bot.instanceId}/bots/delete`, {
                  method: "POST",
                  body: { name: bot.template || bot.name, confirm },
                });
                setNote(result.message || "");
                reload();
              } catch (err) {
                setFormError(err.message);
              }
            }} />
          ) : null}
        </>
      ),
    },
  ]);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1>{t("Bots")}</h1>
          <p className="muted">{t("Tick rows, then start or stop them together.")}</p>
        </div>
        <span className="inline">
          {data?.canCreate ? <AddBot /> : null}
          <button className="btn" type="button" onClick={() => reload()}>{t("Refresh")}</button>
        </span>
      </div>
      <Notice error={formError || error} note={note} />
      {bots.length ? (
        <div className="toolbar">
          <label className="grow">{t("Filter by name")}
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label>{t("Instance")}
            <select value={instanceId} onChange={(event) => setInstance(event.target.value)}>
              <option value="">{t("All instances")}</option>
              {instanceId && !instances.some((item) => String(item.id) === instanceId) ? <option value={instanceId}>{t("Instance")}</option> : null}
              {instances.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>{t("Per page")}
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          {instanceId || query ? <button className="btn" type="button" onClick={() => { setQuery(""); setInstance(""); }}>{t("Reset")}</button> : null}
        </div>
      ) : null}
      {dockSlot && selected.length ? createPortal(
      <section className="card bulk-bar">
        <div className="split">
          <h2>{t("Apply to selected")}</h2>
          <span className="muted">{busy ? t("Working…") : t("{count} selected", { count: selected.length })}</span>
          <button className="btn" type="button" onClick={() => setSelected([])}>{t("Clear selection")}</button>
        </div>
        <div className="transport">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => apply("start")}>{t("Start")}</button>
          <button className="btn btn-danger" type="button" disabled={busy} onClick={() => apply("stop")}>{t("Stop")}</button>
        </div>
      </section>,
      dockSlot) : null}
      {data && filtered.length === 0 ? <p className="empty">{bots.length ? t("Nothing matches.") : t("No bots yet.")}</p> : null}
      {filtered.length ? (
        <ColumnFrame picker={botTable.picker} wrapClass="bot-list">
          <ColumnTable
            tableClass="bot-table"
            columns={botTable.shown}
            rows={visible}
            rowKey={(bot) => bot.id}
            rowClass={(bot) => (selected.includes(bot.id) ? "picked" : "")}
          />
        </ColumnFrame>
      ) : null}
      {filtered.length ? (
        <Pager page={currentPage} pages={pageCount} onPage={setPage} total={filtered.length} />
      ) : null}
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
  const [seenId, setSeenId] = useState(id);
  if (seenId !== id) {
    setSeenId(id);
    setNote("");
    setFormError("");
  }
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const grants = [...form.getAll("grantUser")]
      .filter((userId) => userId && userId !== form.get("ownerUserId"))
      .map((userId) => ({ userId: Number(userId), canControl: true }));
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
    if (result) formElement.querySelector("input[name=apiToken]").value = "";
  }

  if (!instance && error) return <div className="page"><Notice error={error} /></div>;
  if (!instance) return null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{instance.name}</h1>
          <p className="muted">{t("Bots in this container. Start the container outside the panel.")}</p>
          {instance.baseUrl ? <p className="mono">{instance.baseUrl}</p> : null}
        </div>
        <Link className="btn" to={`/bots?instance=${id}`}>{t("Open in Bots")}</Link>
      </div>
      <Notice error={formError || error} note={note} />

      {data.canCreate || data.canManage ? (
      <div className="pair">
      {data.canCreate ? (
        <form className="card" onSubmit={(event) => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get("name");
          run(`/api/instances/${id}/bots`, { name }, (result) => navigate(`/bots/${result.botId}`));
        }}>
          <h2>{t("Create a bot")}</h2>
          <div className="split">
            <label className="grow">{t("Name")}
              <input name="name" required maxLength={120} placeholder="bot" />
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
          <div className="card-head">
            <div>
              <h2>{t("Add an existing bot")}</h2>
              <p className="hint">{t("Template name already on the bot, for example default.")}</p>
            </div>
          </div>
          <div className="split">
            <label className="grow">{t("Name")}
              <input name="name" required maxLength={64} pattern="[A-Za-z0-9_.\-]+" placeholder="default" />
            </label>
            <button className="btn" type="submit">{t("Attach")}</button>
          </div>
        </form>
      ) : null}
      </div>
      ) : null}

      {user.role === "admin" ? (
        <form className="card" onSubmit={saveInstance}>
          <div className="card-head">
            <div>
              <h2>{t("Settings")}</h2>
              <p className="hint">{t("Host and port, for example http://ts3audiobot:58913. Add a token only if the bot requires one.")}</p>
            </div>
          </div>
          <div className="field-grid">
            <label>{t("Display name")}<input name="name" required maxLength={120} defaultValue={instance.name} /></label>
            <label>{t("API address")}<input name="baseUrl" required maxLength={255} defaultValue={instance.baseUrl} /></label>
            <label>{t("Owner")}
              <select name="ownerUserId" defaultValue={instance.ownerUserId || ""}>
                <option value="">{t("No owner")}</option>
                {(data.users || []).map((account) => <option key={account.id} value={account.id}>{account.username}</option>)}
              </select>
            </label>
          </div>
          <div className="split">
            <label className="grow">{t("API UID")}<input name="apiUser" maxLength={128} defaultValue={instance.apiUser || ""} autoComplete="off" /></label>
            <label className="grow">{t("API token")}<input name="apiToken" type="password" maxLength={512} autoComplete="off" placeholder={instance.hasToken ? t("Leave blank to keep the saved token") : t("optional, or uid:token")} /></label>
          </div>
          {instance.hasToken ? <label className="check"><input type="checkbox" name="clearToken" value="on" /> {t("Remove saved token")}</label> : null}
          <label>{t("Note")}<textarea name="notes" maxLength={500} rows={3} defaultValue={instance.notes} /></label>
          <label className="check"><input type="checkbox" name="enabled" value="on" defaultChecked={instance.enabled} /> {t("Instance is enabled")}</label>
          <label>{t("Users")}
            <select name="grantUser" multiple size={Math.min(8, Math.max((data.users || []).length, 3))} defaultValue={(data.grants || []).map((item) => String(item.userId))}>
              {(data.users || []).filter((account) => account.role !== "admin").map((account) => (
                <option key={account.id} value={account.id}>{account.username}</option>
              ))}
            </select>
          </label>
          <p className="hint">{t("These accounts can open this container. They see only bots assigned to them.")}</p>
          <div className="card-foot">
            <button className="btn btn-primary" type="submit">{t("Save")}</button>
            <button className="btn" type="button" onClick={() => run(`/api/admin/instances/${id}/test`, {})}>{t("Check connection")}</button>
          </div>
        </form>
      ) : null}
      {user.role === "admin" ? (
        <form className="card card-danger" onSubmit={async (event) => {
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
          <div className="split">
            <label className="grow">{t("Type the instance name to confirm")}<input name="confirm" required maxLength={120} /></label>
            <button className="btn btn-danger" type="submit">{t("Delete")}</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function DeleteBot({ name, onSubmit }) {
  const { t } = useAuth();
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn btn-danger" type="button" onClick={() => setOpen(true)}>{t("Delete")}</button>;
  return (
    <form className="inline" onSubmit={(event) => {
      event.preventDefault();
      onSubmit(new FormData(event.currentTarget).get("confirm"));
    }}>
      <input name="confirm" required maxLength={120} placeholder={t("Type the bot name to confirm")} aria-label={t("Type the bot name to confirm")} />
      <button className="btn btn-danger" type="submit">{t("Delete")}</button>
      <button className="btn" type="button" onClick={() => setOpen(false)}>{t("Cancel")}</button>
    </form>
  );
}

function useBotAction(botId, onDone) {
  const navigate = useNavigate();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [boundId, setBoundId] = useState(botId);
  if (boundId !== botId) {
    setBoundId(botId);
    setNote("");
    setError("");
  }
  async function act(body) {
    setError("");
    setNote("");
    try {
      const result = await api(`/api/bots/${botId}/action`, { method: "POST", body });
      if (result.redirect) navigate(result.redirect);
      else if (result.botId) navigate(`/bots/${result.botId}`);
      else setNote(result.message || "");
      onDoneRef.current?.();
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
  const player = usePlayer();
  const [query, setQuery] = useState("");
  const [factory, setFactory] = useState("youtube");
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [loadedId, setLoadedId] = useState(id);
  const searchBot = useRef(id);
  searchBot.current = id;
  if (loadedId !== id) {
    setLoadedId(id);
    setQuery("");
    setFactory("youtube");
    setResults([]);
    setSearchError("");
  }
  const sameBot = String(player?.bot?.id || "") === String(id);
  const status = sameBot ? player.status : null;
  const song = status?.song;
  const queue = status?.queue;
  const canControl = Boolean(player?.canControl);
  const offline = status?.online === false;
  const unreachable = Boolean(status?.unreachable);
  const headline = !sameBot && player?.botError
    ? player.botError
    : unreachable ? t("Status unreachable") : offline ? t("Offline") : song?.title || t("Nothing is playing.");
  let pill = t("Not playing");
  let pillClass = "";
  if (offline) {
    pill = t("Offline");
    pillClass = "pill-bad";
  } else if (unreachable) {
    pill = t("Status unreachable");
    pillClass = "pill-warn";
  } else if (song) {
    pill = song.paused ? t("Paused") : t("Playing");
    pillClass = song.paused ? "pill-warn" : "pill-ok";
  }
  function act(body) {
    return player?.act(body);
  }

  const queueTable = useColumns("queue", [
    {
      id: "index",
      label: "#",
      headerClass: "col-index",
      cellClass: "mono",
      cell: (item) => item.index,
    },
    {
      id: "title",
      label: "Queue",
      header: () => queue?.title || t("Queue"),
      cellClass: "clip-cell",
      cellTitle: (item) => item.title,
      cell: (item) => item.title,
    },
    {
      id: "jump",
      locked: "end",
      headerClass: "fit-action",
      cell: (item) => (
        <button className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "jump", index: item.index })}>{t("Jump")}</button>
      ),
    },
  ]);

  return (
    <div className="page">
      <h1>{t("Playback")}</h1>
      <section className="card now-card" aria-label={t("Playback")}>
        <div className="now-head">
          <div>
            <span className="now-label">{t("Now playing")}</span>
            <p className="now-title song-title" title={song?.title || ""}>{headline}</p>
            {song?.sourceHref ? (
              <a className="now-source" href={song.sourceHref} target="_blank" rel="noopener noreferrer">{song.source}</a>
            ) : song?.source ? <span className="now-source muted">{song.source}</span> : null}
          </div>
          <span className={`pill ${pillClass}`}>{pill}</span>
        </div>
        {song?.length ? (
          <div className="now-progress">
            <span className="mono muted">{song.positionLabel || "0:00"}</span>
            <div className="meter" role="img" aria-label={`${song.positionLabel || "0:00"} / ${song.lengthLabel}`}>
              <span style={{ width: `${Math.round(song.progress || 0)}%` }} />
            </div>
            <span className="mono muted">{song.lengthLabel}</span>
          </div>
        ) : null}
        <div className="now-tools">
          <div className="segmented" role="group" aria-label={t("Position")}>
            {[-30, -10, 10, 30].map((delta) => (
              <button key={delta} className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "nudge", delta })}>
                {delta > 0 ? `+${delta}` : delta}s
              </button>
            ))}
          </div>
          <div className="transport">
            <button className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "stop" })}>{t("Stop")}</button>
            <button className="btn btn-danger" type="button" disabled={!canControl} onClick={() => window.confirm(t("Clear the queue?")) && act({ op: "clear" })}>{t("Clear")}</button>
          </div>
        </div>
      </section>
      {queue?.items?.length ? (
        <ColumnFrame picker={queueTable.picker}>
          <ColumnTable
            tableClass="fit-table"
            columns={queueTable.shown}
            rows={queue.items}
            rowKey={(item) => item.index}
            rowClass={(item) => (item.index === queue.index ? "picked" : "")}
          />
        </ColumnFrame>
      ) : null}
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        const botId = id;
        setSearchError("");
        const value = query.trim();
        if (/^https?:\/\//i.test(value)) {
          setResults([]);
          await act({ op: "play", resource: value });
          return;
        }
        try {
          const data = await api(`/api/bots/${botId}/search?q=${encodeURIComponent(value)}&factory=${factory}`);
          if (searchBot.current !== botId) return;
          setResults(data.results || []);
        } catch (err) {
          if (searchBot.current !== botId) return;
          setResults([]);
          setSearchError(err.message);
        }
      }}>
        <div className="card-head">
          <div>
            <h2>{t("Search")}</h2>
            <p className="hint">{t("Type a search term, or paste a link to play it right away.")}</p>
          </div>
        </div>
        <Notice error={searchError} />
        <div className="split">
          <label className="grow">{t("Search term")}
            <input value={query} onChange={(event) => setQuery(event.target.value)} required placeholder="https://" />
          </label>
          <label>{t("Source")}
            <select value={factory} onChange={(event) => setFactory(event.target.value)}>
              <option value="youtube">youtube</option>
              <option value="soundcloud">soundcloud</option>
              <option value="twitch">twitch</option>
              <option value="media">media</option>
            </select>
          </label>
          {/^https?:\/\//i.test(query.trim()) ? (
            <>
              <button className="btn btn-primary" type="submit" disabled={!canControl}>{t("Play")}</button>
              <button className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "add", resource: query.trim() })}>{t("Add to queue")}</button>
            </>
          ) : <button className="btn btn-primary" type="submit">{t("Search")}</button>}
        </div>
        {results.length ? (
          <div className="result-list">
            {results.map((item) => (
              <div className="result-row" key={`${item.index}-${item.title}`}>
                <span className="grow search-title" title={item.title}>{item.title}</span>
                <button className="btn btn-primary" type="button" disabled={!canControl} onClick={() => act({ op: "search-play", index: item.index })}>{t("Play")}</button>
                <button className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "search-add", index: item.index })}>{t("Append")}</button>
              </div>
            ))}
          </div>
        ) : null}
      </form>
    </div>
  );
}

export function Radio() {
  const { id } = useParams();
  const { user, t } = useAuth();
  const player = usePlayer();
  const { data, error, reload } = useLoad(`/api/bots/${id}/streams`);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [loadedId, setLoadedId] = useState(id);
  if (loadedId !== id) {
    setLoadedId(id);
    setNote("");
    setFormError("");
  }
  async function call(path, options) {
    setFormError("");
    try {
      const result = await api(path, options);
      setNote(result.message || "");
      player?.refresh();
      return result;
    } catch (err) {
      setFormError(err.message);
      return null;
    }
  }
  async function save(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setFormError("");
    try {
      const result = await api(`/api/bots/${id}/streams`, {
        method: "POST",
        body: { name: form.get("name"), url: form.get("url"), notes: form.get("notes"), shared: form.get("shared") === "on" },
      });
      setNote(result.message);
      formElement.reset();
      reload();
    } catch (err) {
      setFormError(err.message);
    }
  }
  return (
    <div className="page">
      <h1>{t("Radio")}</h1>
      <Notice error={formError || error} note={note} />
      <div className="page-grid">
      <div className="station-list">
        {data && !(data.streams || []).length ? <p className="empty">{t("No stations yet.")}</p> : null}
        {(data?.streams || []).map((stream) => (
          <article className="card station" key={stream.id}>
            <div className="station-text">
              <h2>{stream.name}{stream.shared ? <span className="pill">{t("Shared")}</span> : null}</h2>
              <p className="mono muted">{stream.displayUrl}</p>
              {stream.notes ? <p className="muted">{stream.notes}</p> : null}
            </div>
            <div className="station-actions">
              <button className="btn btn-primary" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}/play`, { method: "POST", body: { op: "play" } })}>{t("Play")}</button>
              <button className="btn" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}/play`, { method: "POST", body: { op: "add" } })}>{t("Add to queue")}</button>
              {stream.canDelete ? <button className="btn btn-danger" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}`, { method: "DELETE", body: {} }).then((result) => { if (result) reload(); })}>{t("Delete")}</button> : null}
            </div>
          </article>
        ))}
      </div>
      <form className="card" onSubmit={save}>
        <h2>{t("New station")}</h2>
        <label>{t("Name")}<input name="name" required maxLength={120} /></label>
        <label>{t("Stream address")}<input name="url" required placeholder="https://" /></label>
        <label>{t("Note")}<input name="notes" maxLength={500} /></label>
        {user.role === "admin" ? <label className="check"><input type="checkbox" name="shared" value="on" /> {t("Shared catalog")}</label> : null}
        <div className="card-foot">
          <button className="btn btn-primary" type="submit">{t("Save")}</button>
        </div>
      </form>
      </div>
    </div>
  );
}

function sendModeLabel(mode, t) {
  if (mode === "whisper") return t("Whisper");
  if (mode === "voice") return t("Voice");
  if (mode === "custom") return t("Custom");
  return t("Unknown");
}

function whisperLabel(mode, t) {
  if (mode === "whisper") return t("Whisper");
  if (mode === "voice") return t("Voice");
  if (mode === "group") return t("Group whisper");
  if (mode === "none") return t("Not sending");
  return t("Unknown");
}

function namedIds(ids, rows, channels) {
  if (!ids?.length) return "";
  return ids.map((id) => {
    const row = rows.find((item) => item.id === id);
    if (!row) return String(id);
    if (row.path) return `${row.path} (${id})`;
    const channel = channels.find((item) => item.id === row.channelId);
    return channel ? `${row.name} · ${channel.name} (${id})` : `${row.name} (${id})`;
  }).join(", ");
}

function ChannelChoice({ label, channels, saved = "", allowClear = false }) {
  const { t } = useAuth();
  const listKey = channels.map((item) => item.id).join(",");
  const known = channels.some((item) => `/${item.id}` === saved);
  const [seenList, setSeenList] = useState(listKey);
  const [manual, setManual] = useState(channels.length > 0 && saved !== "" && !known);
  const [picked, setPicked] = useState(known ? saved : "");
  const [typedValue, setTypedValue] = useState(saved);
  if (seenList !== listKey) {
    setSeenList(listKey);
    setManual(channels.length > 0 && saved !== "" && !known);
    setPicked(known ? saved : "");
    setTypedValue(saved);
  }
  const typed = channels.length === 0 || manual;
  return (
    <div>
      {channels.length > 0 ? (
        <label>{label}
          <select
            name={typed ? undefined : "channel"}
            value={typed ? "manual" : picked}
            required={!allowClear && !typed}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "manual") setManual(true);
              else {
                setManual(false);
                setPicked(next);
              }
            }}
          >
            <option value="">{allowClear ? t("Not set") : t("Choose a channel")}</option>
            {channels.map((item) => <option key={item.id} value={`/${item.id}`}>{`${item.path} (${item.id})`}</option>)}
            <option value="manual">{t("Channel id or path")}</option>
          </select>
        </label>
      ) : null}
      {typed ? (
        <label>{channels.length ? t("Channel id or path") : label}
          <input
            name="channel"
            required={!allowClear}
            maxLength={200}
            placeholder={t("/5 or Home/Lobby")}
            value={typedValue}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTypedValue(event.target.value)}
          />
        </label>
      ) : null}
    </div>
  );
}

function TargetForm({ kind, rows, channels, title, idLabel, subscribedLabel, subscribed, empty, act, done }) {
  const { t } = useAuth();
  const mode = useRef("add");
  const listId = `whisper-${kind}-list`;
  return (
    <form className="whisper-panel" onSubmit={(event) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const data = new FormData(formElement);
      const on = mode.current !== "remove";
      const ids = [...data.getAll("picked"), ...String(data.get("ids") || "").split(/[\s,;]+/)]
        .map((item) => String(item).trim())
        .filter(Boolean);
      act({ op: "whisper-target", kind, ids, on }).then((result) => {
        if (result) formElement.reset();
        done(result);
      });
    }}>
      <div className="whisper-head">
        <h3 id={listId}>{title}</h3>
        <span className="pill">{rows.length}</span>
      </div>
      <p className="whisper-current">{subscribedLabel}: <strong>{subscribed || t("None")}</strong></p>
      {rows.length ? (
        <select className="whisper-list" name="picked" multiple aria-labelledby={listId}>
          {rows.map((item) => {
            const channel = channels.find((entry) => entry.id === item.channelId);
            const text = item.path
              ? `${item.path} (${item.id})`
              : channel
                ? `${item.name} · ${channel.name} (${item.id})`
                : `${item.name} (${item.id})`;
            return <option key={item.id} value={item.id}>{text}</option>;
          })}
        </select>
      ) : <div className="whisper-list whisper-empty">{empty}</div>}
      <label>{idLabel}
        <input name="ids" inputMode="numeric" autoComplete="off" spellCheck={false} placeholder={kind === "client" ? "12, 34" : "5, 8"} />
      </label>
      <p className="muted">{t("Pick from the list, type ids, or both.")}</p>
      <div className="inline">
        <button className="btn btn-primary" type="submit" onClick={() => { mode.current = "add"; }}>{t("Subscribe")}</button>
        <button className="btn" type="submit" onClick={() => { mode.current = "remove"; }}>{t("Remove")}</button>
      </div>
    </form>
  );
}

function StartupStream({ hosting, stations }) {
  const { t } = useAuth();
  const saved = hosting?.startup || "";
  const savedId = hosting?.startupStreamId == null ? "" : String(hosting.startupStreamId);
  const byId = stations.find((station) => String(station.id) === savedId);
  const urlMatches = stations.filter((station) => station.url && station.url === saved.trim());
  const initial = byId || (urlMatches.length === 1 ? urlMatches[0] : null);
  const [choice, setChoice] = useState(initial ? String(initial.id) : saved ? "custom" : "");
  const [custom, setCustom] = useState(initial ? "" : saved);
  const station = stations.find((item) => String(item.id) === choice);
  const typed = custom.trim();
  const customMatches = choice === "custom" ? stations.filter((item) => item.url && item.url === typed) : [];
  const customMatch = customMatches.length === 1 ? customMatches[0] : null;
  return (
    <div>
      <label>{t("Stream on connect")}
        <select value={choice} onChange={(event) => {
          const next = event.target.value;
          if (next === "custom" && !custom.trim()) setCustom(station?.url || saved);
          setChoice(next);
        }}>
          <option value="">{t("Not set")}</option>
          {stations.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
          <option value="custom">{t("Other address")}</option>
        </select>
      </label>
      {station ? <input type="hidden" name="streamId" value={station.id} /> : null}
      {choice === "custom" ? (
        <label>{t("Address")}
          <input
            name="startup"
            value={custom}
            placeholder="https://"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setCustom(event.target.value)}
          />
          {customMatch ? <input type="hidden" name="streamId" value={customMatch.id} /> : null}
        </label>
      ) : station ? null : <input type="hidden" name="startup" value="" />}
      {station?.url ? <p className="muted mono startup-url">{station.url}</p> : null}
      <p className="muted">{t("Played when the bot connects. Not set turns it off.")}</p>
    </div>
  );
}

export function Connection() {
  const { id } = useParams();
  const { t } = useAuth();
  const { data, error, reload } = useLoad(`/api/bots/${id}/connection`);
  const player = usePlayer();
  const { note, error: actionError, act, setError, setNote } = useBotAction(id, player?.refresh);
  const [localNote, setLocalNote] = useState("");
  const [moveTick, setMoveTick] = useState(0);
  const [seenId, setSeenId] = useState(id);
  const pageId = useRef(id);
  pageId.current = id;
  const [live, setLive] = useState(null);
  const [liveTick, setLiveTick] = useState(0);
  if (seenId !== id) {
    setSeenId(id);
    setLocalNote("");
    setLive(null);
  }
  function kept(result) {
    return pageId.current === id && result;
  }
  const onServer = data?.connection?.status === "connected" || data?.connection?.status === "connecting";
  // A full page load already carries fresh lists.
  useEffect(() => {
    setLive(null);
  }, [data]);
  // Clients join, leave, and get a new id when they reconnect, so the whisper lists are read again while the page is open.
  useEffect(() => {
    if (!onServer) return undefined;
    let stop = false;
    async function pull() {
      try {
        const next = await api(`/api/bots/${id}/whisper`);
        if (!stop) setLive(next);
      } catch {
        /* Keep the last list. The next pull tries again. */
      }
    }
    if (liveTick) pull();
    const timer = window.setInterval(pull, 10000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [id, onServer, liveTick]);
  const w = live || data || {};
  function afterTarget(result) {
    if (kept(result)) setLiveTick((value) => value + 1);
  }
  if (!data && !error) return <div className="page"><h1>{t("Connection")}</h1></div>;
  return (
    <div className="page">
      <h1>{t("Connection")}</h1>
      <Notice error={error || actionError} note={note || localNote} />
      <div className="pair">
      {data?.connection ? (
        <section className="card">
          <div className="card-head">
            <h2>{t("Server")}</h2>
            <span className={`pill pill-${data.connection.status === "connected" ? "ok" : data.connection.status === "offline" ? "bad" : "warn"}`}>{data.connection.statusLabel}</span>
          </div>
          {data.connection.error ? <p className="muted">{data.connection.error}</p> : null}
          {data.connection.status === "connected" || data.connection.status === "connecting" ? (
            <dl className="facts">
              <div><dt>{t("Server")}</dt><dd className="mono">{data.connection.server || "—"}</dd></div>
              <div>
                <dt>{t("TeamSpeak ID")}</dt>
                <dd className="mono">{data.teamspeakId || <span className="muted">{data.teamspeakError || t("Unknown")}</span>}</dd>
              </div>
            </dl>
          ) : (
            <form className="split" key={data.connection.server || "address"} onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              act({ op: "template-address", name: data.connection.name, address: new FormData(formElement).get("address") }).then((result) => {
                if (kept(result)) reload();
              });
            }}>
              <label className="grow">{t("Server")}
                <input name="address" defaultValue={data.connection.server || data?.hosting?.address || ""} required maxLength={200} />
              </label>
              <button className="btn btn-primary" type="submit">{t("Save")}</button>
            </form>
          )}
          <div className="card-foot">
            {data.connection.status !== "connected" && data.connection.status !== "connecting" ? <button className="btn btn-primary" type="button" onClick={() => act({ op: "connect", name: data.connection.name }).then((result) => { if (kept(result)) reload(); })}>{t("Start")}</button> : null}
            {data.connection.id != null ? <button className="btn btn-danger" type="button" onClick={() => act({ op: "disconnect", instanceId: data.connection.id }).then((result) => { if (kept(result)) reload(); })}>{t("Disconnect")}</button> : null}
            {data.teamspeakId && onServer ? <button className="btn" type="button" onClick={() => navigator.clipboard?.writeText(data.teamspeakId)}>{t("Copy")}</button> : null}
          </div>
        </section>
      ) : null}
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{t("Channel commander")}</h2>
            <p className="hint">{t("Channel commander. Saved, and applied again on each connect.")}</p>
          </div>
        </div>
        <dl className="facts">
          <div><dt>{t("Next connect")}</dt><dd>{data?.commanderSaved == null ? t("Unknown") : data.commanderSaved ? t("On") : t("Off")}{data?.commanderSavedError ? <span className="muted"> {data.commanderSavedError}</span> : null}</dd></div>
          <div><dt>{t("Right now")}</dt><dd>{data?.commander == null ? t("Unknown") : data.commander ? t("On") : t("Off")}{data?.commanderError ? <span className="muted"> {data.commanderError}</span> : null}</dd></div>
        </dl>
        <div className="card-foot">
          <button className="btn btn-primary" type="button" onClick={() => act({ op: "commander", mode: "on" }).then((result) => { if (kept(result)) reload(); })}>{t("Turn on")}</button>
          <button className="btn" type="button" onClick={() => act({ op: "commander", mode: "off" }).then((result) => { if (result) reload(); })}>{t("Turn off")}</button>
        </div>
      </section>
      </div>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{t("Whisper")}</h2>
            <p className="hint">{t("Whisper: subscribed clients. Voice: the whole channel. Applies from the next song.")}</p>
          </div>
          <div className="segmented" role="group" aria-label={t("Whisper")}>
            <button className="btn" type="button" aria-pressed={data?.sendMode === "whisper"} onClick={() => act({ op: "whisper", mode: "whisper" }).then((result) => { if (kept(result)) reload(); })}>{t("Whisper")}</button>
            <button className="btn" type="button" aria-pressed={data?.sendMode === "voice"} onClick={() => act({ op: "whisper", mode: "voice" }).then((result) => { if (kept(result)) reload(); })}>{t("Voice")}</button>
          </div>
        </div>
        <dl className="facts">
          <div><dt>{t("Next song")}</dt><dd>{sendModeLabel(data?.sendMode, t)}{data?.sendModeError ? <span className="muted"> {data.sendModeError}</span> : null}</dd></div>
          <div><dt>{t("Right now")}</dt><dd>{whisperLabel(w.whisper, t)}{w.whisperError ? <span className="muted"> {w.whisperError}</span> : null}</dd></div>
        </dl>
        {data?.sendMode === "custom" ? <p className="hint">{t("A custom command is saved. Whisper or Voice replaces it.")}</p> : null}
        {onServer ? (
          <>
            <p className="hint">{t("Subscribe turns whisper on and adds those clients or channels. Remove drops them. The bot has to be connected.")}</p>
            {w.treeError ? <p className="muted">{w.treeError}</p> : null}
            <div className="whisper-targets">
              <TargetForm
                kind="client"
                rows={w.clients || []}
                channels={w.channels || []}
                title={t("Clients")}
                idLabel={t("Client ids")}
                subscribedLabel={t("Subscribed clients")}
                subscribed={w.whisperError ? "—" : namedIds(w.whisperClients, w.clients || [], w.channels || [])}
                empty={t("No other client is on the server right now.")}
                act={act}
                done={afterTarget}
              />
              <TargetForm
                kind="channel"
                rows={w.channels || []}
                channels={w.channels || []}
                title={t("Channels")}
                idLabel={t("Channel ids")}
                subscribedLabel={t("Subscribed channels")}
                subscribed={w.whisperError ? "—" : namedIds(w.whisperChannels, w.channels || [], w.channels || [])}
                empty={t("None")}
                act={act}
                done={afterTarget}
              />
            </div>
            <div className="inline">
              <button className="btn" type="button" onClick={() => setLiveTick((value) => value + 1)}>{t("Refresh list")}</button>
            </div>
          </>
        ) : <p className="hint">{t("Connect the bot to subscribe clients and channels.")}</p>}
      </section>
      <form className="card" key={[
        data?.bot?.name,
        data?.hosting?.name,
        data?.hosting?.nickname,
        data?.hosting?.channel,
        data?.hosting?.bitrate,
        data?.hosting?.volume,
        data?.hosting?.run,
        data?.hosting?.startup,
        data?.hosting?.startupStreamId,
      ].join("|") || "hosting"} onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const label = String(form.get("label") || "").trim();
        const labelChanged = Boolean(label && label !== (data?.bot?.name || ""));
        const patch = hostingChanges(Object.fromEntries(form.entries()), data?.hosting);
        setError("");
        setNote("");
        setLocalNote("");
        if (labelChanged) {
          try {
            const renamed = await api(`/api/bots/${id}/label`, { method: "POST", body: { name: label } });
            if (pageId.current === id) setLocalNote(renamed.message || "");
          } catch (err) {
            setError(err.message);
            return;
          }
        }
        if (!Object.keys(patch).length) {
          if (labelChanged) reload();
          else setLocalNote(t("Nothing changed."));
          return;
        }
        const result = await act({ op: "template-hosting", name: form.get("name"), ...patch });
        if (pageId.current !== id) return;
        if (result) {
          setLocalNote(result.message || "");
          reload();
        } else if (labelChanged) reload();
      }}>
        <div className="card-head">
          <div>
            <h2>{t("Connection settings")}</h2>
            <p className="hint">{t("Clear nickname or channel to remove it. Leave password, bitrate, or volume empty to keep the current value. Passwords are sent to the bot and not stored here.")}</p>
          </div>
        </div>
        <input type="hidden" name="name" value={data?.hosting?.name || ""} />
        <div className="field-grid">
          <div className="field">
            <label>{t("Display name")}
              <input name="label" maxLength={120} defaultValue={data?.bot?.name || ""} />
            </label>
            <p className="hint">{t("Name in this list. The TeamSpeak nickname is the next field.")}</p>
          </div>
          <div className="field">
            <label>{t("Nickname")}<input name="nickname" maxLength={30} placeholder="Music" defaultValue={data?.hosting?.nickname || ""} /></label>
            <p className="hint">{t("Applied now if the bot is online, otherwise on the next connect.")}</p>
          </div>
        </div>
        <div className="field">
          <ChannelChoice label={t("Default channel")} channels={data?.channels || []} saved={data?.hosting?.channel || ""} allowClear />
          <p className="hint">{t("Pick a channel, or type /5 or Home/Lobby. Clear and save to remove it. Setting one also moves a connected bot.")}</p>
        </div>
        <div className="split">
          <label className="grow">{t("Server password")}
            <input name="serverPassword" type="password" autoComplete="off" />
            {data?.hosting?.hasServerPassword ? <span className="muted">{t("A server password is saved on the bot.")}</span> : null}
          </label>
          <label className="grow">{t("Channel password")}
            <input name="channelPassword" type="password" autoComplete="off" />
            {data?.hosting?.hasChannelPassword ? <span className="muted">{t("A channel password is saved on the bot.")}</span> : null}
          </label>
        </div>
        <div className="split">
          <label>{t("Bitrate (kbps)")}<input name="bitrate" inputMode="numeric" placeholder="96" defaultValue={data?.hosting?.bitrate ?? ""} /></label>
          <label>{t("Default volume")}<input name="volume" inputMode="numeric" min="0" max="100" placeholder="50" defaultValue={data?.hosting?.volume ?? ""} /></label>
          <label>{t("Start when the process launches")}
            <select name="run" defaultValue={data?.hosting?.run == null ? "" : data.hosting.run ? "on" : "off"}>
              {data?.hosting?.run == null ? <option value="">{t("Not set")}</option> : null}
              <option value="on">{t("Yes")}</option>
              <option value="off">{t("No")}</option>
            </select>
          </label>
        </div>
        <StartupStream hosting={data?.hosting} stations={data?.stations || []} />
        <div className="card-foot">
          <button className="btn btn-primary" type="submit">{t("Save")}</button>
        </div>
      </form>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{t("Move now")}</h2>
            <p className="hint">{t("Moves the connected bot now. The saved default channel stays. Pick a channel, or type /5 or Home/Lobby.")}</p>
          </div>
        </div>
        <form className="split" key={moveTick} onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const channel = new FormData(formElement).get("channel");
          act({ op: "move", channel }).then((result) => {
            if (kept(result)) setMoveTick((value) => value + 1);
          });
        }}>
          <div className="grow">
            <ChannelChoice label={t("Channel")} channels={data?.channels || []} />
          </div>
          <button className="btn" type="submit">{t("Move")}</button>
        </form>
      </section>
    </div>
  );
}

export function Users() {
  const { user, t } = useAuth();
  const { data, error, setData } = useLoad("/api/admin/users");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  async function post(path, body) {
    setFormError("");
    const result = await api(path, { method: "POST", body });
    setNote(result.message || "");
    if (result.users) setData({ users: result.users, instances: result.instances || [] });
    if (result.signedOut) window.location.assign("/login");
    return result;
  }
  const accounts = data?.users || [];
  const pageCount = Math.max(1, Math.ceil(accounts.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const visible = accounts.slice(start, start + pageSize);
  const instances = data?.instances || [];
  function instanceNames(ids) {
    const names = (ids || []).map((id) => instances.find((item) => item.id === id)?.name).filter(Boolean);
    return names.length ? names.join(", ") : t("None");
  }
  const userTable = useColumns("users", [
    {
      id: "username",
      label: "Username",
      cellClass: "nowrap",
      cell: (account) => (
        <>
          {account.username}
          {account.hasPassword ? null : <span className="pill pill-warn" title={t("Cannot sign in until a password is set")}>{t("No password")}</span>}
        </>
      ),
    },
    {
      id: "role",
      label: "Role",
      cellClass: "nowrap",
      cell: (account) => (account.role === "admin" ? t("Administrator") : t("User")),
    },
    {
      id: "status",
      label: "Status",
      cellClass: "nowrap",
      cell: (account) => <span className={account.suspended ? "pill pill-bad" : "pill pill-ok"}>{account.suspended ? t("Suspended") : t("Active")}</span>,
    },
    {
      id: "create",
      label: "Can create bots",
      cellClass: "nowrap",
      cell: (account) => (account.canCreateBots ? t("Yes") : t("No")),
    },
    {
      id: "limit",
      label: "Bot limit",
      cellClass: "nowrap",
      cell: (account) => account.botLimit ?? t("Unlimited"),
    },
    {
      id: "instances",
      label: "Instances",
      cell: (account) => <span className="user-instances" title={instanceNames(account.instanceIds)}>{instanceNames(account.instanceIds)}</span>,
    },
    {
      id: "edit",
      locked: "end",
      cell: (account) => (
        <button className="btn" type="button" onClick={() => setOpenId(openId === account.id ? null : account.id)}>{openId === account.id ? t("Close") : t("Edit")}</button>
      ),
    },
  ]);
  if (user.role !== "admin") return <p className="flash flash-error">{t("Administrators only")}</p>;
  return (
    <div className="page">
      <div className="page-intro">
        <h1>{t("Users")}</h1>
        <p className="muted">{t("Sign-in for this panel, not a TeamSpeak login.")}</p>
      </div>
      <Notice error={formError || error} note={note} />
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        try {
          const role = form.get("role");
          const instanceIds = [...form.getAll("instanceId")];
          if (role !== "admin" && instanceIds.length === 0) {
            setFormError(t("Assign at least one instance"));
            return;
          }
          await post("/api/admin/users", {
            username: form.get("username"),
            password: form.get("password"),
            role,
            botLimit: form.get("botLimit"),
            canCreateBots: form.get("canCreateBots") === "yes",
            instanceIds,
          });
          formElement.reset();
        } catch (err) {
          setFormError(err.message);
        }
      }}>
        <div className="card-head">
          <div>
            <h2>{t("Create")}</h2>
            <p className="hint">{t("A user needs one instance. An administrator does not. Can create bots allows a new bot on any enabled instance.")}</p>
            <p className="hint">{t("Empty bot limit means unlimited. Bots with no assignee count for the instance owner.")}</p>
          </div>
        </div>
        <div className="field-grid">
          <label>{t("Username")}<input name="username" required maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,31}" autoComplete="off" /></label>
          <label>{t("Password")}<input name="password" type="password" autoComplete="new-password" placeholder={t("Leave empty until you set a password")} /></label>
          <label>{t("Role")}
            <select name="role" defaultValue="user">
              <option value="user">{t("User")}</option>
              <option value="admin">{t("Administrator")}</option>
            </select>
          </label>
          <label>{t("Bot limit")}<input name="botLimit" inputMode="numeric" placeholder={t("Unlimited")} /></label>
          <label>{t("Can create bots")}
            <select name="canCreateBots" defaultValue="no">
              <option value="no">{t("No")}</option>
              <option value="yes">{t("Yes")}</option>
            </select>
          </label>
          <label>{t("Instances")}
            <select name="instanceId" multiple size={Math.min(6, Math.max(instances.length, 3))}>
              {instances.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <div className="card-foot">
          <button className="btn btn-primary" type="submit">{t("Create")}</button>
        </div>
      </form>
      <div className="table-foot">
        <h2>{t("Accounts")}</h2>
        <label>{t("Per page")}
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <ColumnFrame picker={userTable.picker}>
        <ColumnTable
          columns={userTable.shown}
          rows={visible}
          rowKey={(account) => account.id}
          extra={(account, count) => (openId === account.id ? (
            <tr className="user-edit-row">
              <td colSpan={count}>
                <form className="user-edit" key={`${account.id}-${account.role}-${account.suspended}-${account.canCreateBots}-${(account.instanceIds || []).join(".")}`} onSubmit={async (event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        const role = form.get("role");
                        const instanceIds = [...form.getAll("instanceId")];
                        if (role !== "admin" && instanceIds.length === 0) {
                          setFormError(t("Assign at least one instance"));
                          return;
                        }
                        try {
                          await post(`/api/admin/users/${account.id}/role`, { role });
                          await post(`/api/admin/users/${account.id}/limit`, { botLimit: form.get("botLimit") });
                          await post(`/api/admin/users/${account.id}/create-bots`, { canCreateBots: form.get("canCreateBots") === "yes" });
                          await post(`/api/admin/users/${account.id}/instances`, { instanceIds });
                          const suspend = form.get("suspended") === "yes";
                          if (suspend !== account.suspended && account.id !== user.id) {
                            await post(`/api/admin/users/${account.id}/suspend`, { suspended: suspend });
                          }
                        } catch (err) {
                          setFormError(err.message);
                        }
                      }}>
                        <div className="split">
                          <label>{t("Role")}
                            <select name="role" defaultValue={account.role}>
                              <option value="user">{t("User")}</option>
                              <option value="admin">{t("Administrator")}</option>
                            </select>
                          </label>
                          <label>{t("Can create bots")}
                            <select name="canCreateBots" defaultValue={account.canCreateBots ? "yes" : "no"}>
                              <option value="no">{t("No")}</option>
                              <option value="yes">{t("Yes")}</option>
                            </select>
                          </label>
                          <label>{t("Status")}
                            <select name="suspended" defaultValue={account.suspended ? "yes" : "no"} disabled={account.id === user.id}>
                              <option value="no">{t("Active")}</option>
                              <option value="yes">{t("Suspended")}</option>
                            </select>
                          </label>
                          <label>{t("Bot limit")}<input className="bot-limit" name="botLimit" inputMode="numeric" placeholder={t("Unlimited")} defaultValue={account.botLimit ?? ""} /></label>
                        </div>
                        <label>{t("Instances")}
                          <select name="instanceId" multiple size={Math.min(6, Math.max(instances.length, 3))} defaultValue={(account.instanceIds || []).map(String)}>
                            {instances.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </select>
                        </label>
                        <div className="split">
                          <label className="grow">{t("New password")}<input name="password" type="password" autoComplete="new-password" /></label>
                          <button className="btn" type="button" onClick={async (event) => {
                            const password = new FormData(event.currentTarget.form).get("password");
                            if (!password) return;
                            try { await post(`/api/admin/users/${account.id}/password`, { password }); }
                            catch (err) { setFormError(err.message); }
                          }}>{t("Set")}</button>
                          <button className="btn btn-primary" type="submit">{t("Save")}</button>
                          {account.id !== user.id ? (
                            <button className="btn btn-danger" type="button" onClick={async () => {
                              if (!window.confirm(t("Delete this account?"))) return;
                              try {
                                const result = await api(`/api/admin/users/${account.id}`, { method: "DELETE", body: { confirm: true } });
                                setNote(result.message);
                                setOpenId(null);
                                setData({ users: result.users, instances: result.instances || [] });
                              } catch (err) { setFormError(err.message); }
                            }}>{t("Remove")}</button>
                          ) : null}
                        </div>
                      </form>
              </td>
            </tr>
          ) : null)}
        />
      </ColumnFrame>
      <Pager page={currentPage} pages={pageCount} onPage={setPage} total={accounts.length} />
    </div>
  );
}

export function Audit() {
  const { user, t } = useAuth();
  const { data, error, setData } = useLoad("/api/admin/audit");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const auditTable = useColumns("audit", [
    {
      id: "time",
      label: "Time",
      cellClass: "mono nowrap",
      cell: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : ""),
    },
    { id: "name", label: "Name", cell: (row) => row.username },
    { id: "action", label: "Action", cell: (row) => <span className="pill">{row.action}</span> },
    {
      id: "detail",
      label: "Detail",
      cellClass: "audit-detail",
      cell: (row) => (
        <>
          {row.detail}
          {row.botName ? <div className="muted">{row.botName}</div> : null}
        </>
      ),
    },
  ]);
  if (user.role !== "admin") return <p className="flash flash-error">{t("Administrators only")}</p>;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("Audit")}</h1>
          <p className="muted">{t("Last 200 actions. Tokens are not shown.")}</p>
          <p className="hint">{t("Keep the last day deletes entries older than 24 hours.")}</p>
        </div>
        <button className="btn btn-danger" type="button" disabled={busy} onClick={async () => {
          if (!window.confirm(t("Delete entries older than one day?"))) return;
          setBusy(true);
          setFormError("");
          setNote("");
          try {
            const result = await api("/api/admin/audit/trim", { method: "POST", body: { confirm: true } });
            setNote(result.message || "");
            setData({ rows: result.rows || [] });
          } catch (err) {
            setFormError(err.message);
          } finally {
            setBusy(false);
          }
        }}>{t("Keep the last day")}</button>
      </div>
      <Notice error={formError || error} note={note} />
      {data && !(data.rows || []).length ? <p className="empty">{t("No entries.")}</p> : null}
      <ColumnFrame picker={auditTable.picker}>
        <ColumnTable
          columns={auditTable.shown}
          rows={data?.rows || []}
          rowKey={(row, index) => `${row.createdAt}-${index}`}
        />
      </ColumnFrame>
    </div>
  );
}

export function Account() {
  const { user, t } = useAuth();
  const { data, error: loadError } = useLoad("/api/account");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const limitText = !data ? "" : data.botLimit == null
    ? t("No bot limit. {count} bots are in use.", { count: data.botCount })
    : t("{used} of {limit} bots are in use.", { used: data.botCount, limit: data.botLimit });
  return (
    <div className="page">
      <h1>{t("Account")}</h1>
      <Notice error={error || loadError} note={note} />
      <div className="pair">
      <section className="card">
        <div className="card-head">
          <h2>{user.username}</h2>
          <span className="pill">{user.role === "admin" ? t("Administrator") : t("User")}</span>
        </div>
        {data ? (
          <dl className="facts">
            <div><dt>{t("Bot limit")}</dt><dd>{data.botLimit == null ? t("Unlimited") : data.botLimit}</dd></div>
            <div><dt>{t("Bots")}</dt><dd>{data.botCount}</dd></div>
          </dl>
        ) : null}
        {data && data.botLimit != null ? (
          <div className="meter" role="img" aria-label={limitText}>
            <span style={{ width: `${Math.min(100, Math.round((data.botCount / Math.max(1, data.botLimit)) * 100))}%` }} />
          </div>
        ) : null}
        {limitText ? <p className="hint">{limitText}</p> : null}
      </section>
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        setError("");
        try {
          const result = await api("/api/account/password", {
            method: "POST",
            body: { current: form.get("current"), password: form.get("password"), confirm: form.get("confirm") },
          });
          setNote(result.message);
          formElement.reset();
        } catch (err) {
          setError(err.message);
        }
      }}>
        <h2>{t("Password")}</h2>
        <label>{t("Current password")}<input name="current" type="password" required autoComplete="current-password" /></label>
        <label>{t("New password")}<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
        <label>{t("Confirm")}<input name="confirm" type="password" required minLength={10} autoComplete="new-password" /></label>
        <div className="card-foot">
          <button className="btn btn-primary" type="submit">{t("Change password")}</button>
        </div>
      </form>
      </div>
    </div>
  );
}
