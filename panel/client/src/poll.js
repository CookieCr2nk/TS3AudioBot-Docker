// Calls `pull` again `intervalMs` after the previous call has finished, so slow answers never overlap
// and an older answer cannot arrive after a newer one. While the page is hidden nothing is fetched.
// Showing the page again, or focusing the window, pulls at once. Returns a stop function.
export function startPolling(pull, intervalMs, { doc = globalThis.document, win = globalThis.window, immediate = true } = {}) {
  let timer = null;
  let running = false;
  let stopped = false;

  function schedule() {
    if (stopped || running || timer != null) return;
    timer = setTimeout(run, intervalMs);
  }

  async function run() {
    timer = null;
    if (stopped || running) return;
    if (doc?.hidden) return;
    running = true;
    try {
      await pull();
    } catch {
      /* The caller reports failures. The next pull tries again. */
    } finally {
      running = false;
    }
    schedule();
  }

  function onVisibility() {
    if (stopped || doc?.hidden || running) return;
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    run();
  }

  doc?.addEventListener?.("visibilitychange", onVisibility);
  // Switching back from the TeamSpeak client often leaves the tab visible the whole time, so focus counts too.
  win?.addEventListener?.("focus", onVisibility);
  if (immediate) run();
  else schedule();

  return () => {
    stopped = true;
    if (timer != null) clearTimeout(timer);
    timer = null;
    doc?.removeEventListener?.("visibilitychange", onVisibility);
    win?.removeEventListener?.("focus", onVisibility);
  };
}
