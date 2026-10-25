function showToast(message, ok) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.hidden = false;
  toast.textContent = message;
  toast.className = ok ? "toast toast-ok" : "toast toast-error";
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 4000);
}

document.addEventListener("submit", (event) => {
  const message = event.target?.getAttribute?.("data-confirm");
  if (message && !window.confirm(message)) event.preventDefault();
});

function httpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return "";
  }
  return "";
}

function startPlayer(root) {
  const botId = root.getAttribute("data-player");
  if (!botId) return;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || "";
  let timer = 0;
  let busy = false;
  let touchingVolume = false;

  async function postAction(fields) {
    const body = new URLSearchParams(fields);
    body.set("csrf", csrf);
    const response = await fetch(`/bots/${botId}/action`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRF-Token": csrf,
      },
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "Aktion fehlgeschlagen");
  }

  function apply(status) {
    const song = status.song;
    const title = root.querySelector("[data-now=title]");
    const state = root.querySelector("[data-now=state]");
    const position = root.querySelector("[data-now=position]");
    const length = root.querySelector("[data-now=length]");
    const bar = root.querySelector("[data-now=bar]");
    const link = root.querySelector("[data-now=source-link]");
    const text = root.querySelector("[data-now=source-text]");
    if (title) title.textContent = song?.title || "Gerade läuft nichts.";
    if (state) state.textContent = song ? (song.paused ? "Pausiert" : "Läuft") : "Leer";
    if (position) position.textContent = song?.positionLabel || "0:00";
    if (length) length.textContent = song?.lengthLabel || "--:--";
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, Number(song?.progress) || 0))}%`;
    const href = httpUrl(song?.sourceHref || "");
    if (link && text) {
      if (href) {
        link.hidden = false;
        link.href = href;
        link.textContent = song.source || href;
        text.hidden = true;
        text.textContent = "";
      } else {
        link.hidden = true;
        link.removeAttribute("href");
        link.textContent = "";
        text.hidden = !song?.source;
        text.textContent = song?.source || "";
      }
    }
    const toggle = document.querySelector("[data-toggle-play]");
    if (toggle && song) {
      const op = toggle.querySelector("input[name=op]");
      const button = toggle.querySelector("button");
      if (op && button) {
        op.value = song.paused ? "resume" : "pause";
        button.textContent = song.paused ? "Fortsetzen" : "Pause";
      }
    }
    const number = document.querySelector("[data-volume-number]");
    const slider = document.querySelector("[data-volume]");
    if (!touchingVolume && status.volume != null) {
      if (number && document.activeElement !== number) number.value = String(status.volume);
      if (slider && document.activeElement !== slider) slider.value = String(status.volume);
    }
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch(`/bots/${botId}/status`, { headers: { Accept: "application/json" } });
      if (response.status === 401) {
        showToast("Sitzung abgelaufen", false);
        window.clearInterval(timer);
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        showToast(data.error || "Status nicht verfügbar", false);
        return;
      }
      apply(data.status);
    } catch {
      showToast("Status nicht erreichbar", false);
    } finally {
      busy = false;
    }
  }

  const slider = document.querySelector("[data-volume]");
  if (slider) {
    slider.addEventListener("pointerdown", () => {
      touchingVolume = true;
    });
    slider.addEventListener("change", async () => {
      touchingVolume = false;
      try {
        await postAction({ op: "volume", volume: slider.value });
        const number = document.querySelector("[data-volume-number]");
        if (number) number.value = slider.value;
        await refresh();
      } catch (err) {
        showToast(err.message, false);
      }
    });
  }

  function start() {
    window.clearInterval(timer);
    timer = window.setInterval(refresh, 4000);
  }
  start();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.clearInterval(timer);
    else {
      refresh();
      start();
    }
  });
}

const player = document.querySelector("[data-player]");
if (player) startPlayer(player);
