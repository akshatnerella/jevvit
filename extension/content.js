// Content script: finds posts in Reddit feeds, asks the service worker to classify them,
// and paints a colored box + label on each one.
(() => {
  const BATCH_SIZE = 10; // the backend's per-request maximum
  const MAX_IN_FLIGHT = 3;
  const NEAR_VIEWPORT_PX = 1500;
  // Already bait by definition; a ⚡bait flag on these would just repeat the label.
  const BAIT_CATEGORIES = new Set(["ragebait", "karma_farming"]);

  let settings = Jev.normalize(null);
  let results = new Map(); // postId -> result, for the current category set
  const queue = new Map(); // postId -> post payload
  let generation = 0; // bumped when categories change; stale responses are dropped
  let inFlight = 0;
  let retryDelay = 0;
  let retryAt = 0;
  let lastError = null;
  let dead = false;

  // After the extension is reloaded or updated, this old copy can no longer talk to it.
  const alive = () => !dead && !!chrome.runtime?.id;

  // ---------- painting ----------

  function paint(el, r) {
    const cat = Jev.lookup(settings, r.category);
    el.dataset.jvState = "done";
    el.dataset.jvCat = r.category;
    el.dataset.jvMode = settings.enabled ? cat.mode : "off";
    el.dataset.jvLow = r.confidence < settings.lowConfidence ? "1" : "0";
    el.style.setProperty("--jv-color", cat.color);
    const pct = settings.showConfidence ? ` ${Math.round(r.confidence * 100)}%` : "";
    const bait = settings.showBait && !BAIT_CATEGORIES.has(r.category) && r.bait >= 0.75 ? " ⚡bait" : "";
    el.dataset.jvLabel = `${cat.label}${pct}${bait}`;
    if (r.probabilities) {
      el.dataset.jvTip = Object.entries(r.probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, p]) => `${Jev.lookup(settings, k).label} ${Math.round(p * 100)}%`)
        .join(" · ") + (r.bait != null ? ` · bait ${Math.round(r.bait * 100)}%` : "");
    }
  }

  function markPending(el) {
    el.dataset.jvState = "pending";
    el.dataset.jvMode = settings.enabled ? "box" : "off";
  }

  function clearEl(el) {
    for (const k of ["jvState", "jvCat", "jvMode", "jvLow", "jvLabel", "jvTip", "jvId"]) delete el.dataset[k];
    el.style.removeProperty("--jv-color");
  }

  function repaintAll() {
    document.querySelectorAll("[data-jv-id]").forEach((el) => {
      const r = results.get(el.dataset.jvId);
      if (r) paint(el, r);
      else if (el.dataset.jvState !== "waiting") markPending(el);
    });
  }

  // ---------- scanning ----------

  function nearViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > -NEAR_VIEWPORT_PX && r.top < innerHeight + NEAR_VIEWPORT_PX;
  }

  function scan() {
    if (!alive()) return shutdown();
    for (const container of JevvitParse.findPosts()) {
      const el = JevvitParse.paintTarget(container);
      if (!el || !nearViewport(el)) continue;

      const post = JevvitParse.parsePost(container);
      if (!post) continue;
      if (el.dataset.jvId === post.id) continue; // already handled

      clearEl(el);
      el.dataset.jvId = post.id;
      const known = results.get(post.id);
      if (known) paint(el, known);
      else {
        markPending(el);
        queue.set(post.id, post);
      }
    }
    pump();
  }

  function backoff() {
    retryDelay = Math.min(retryDelay ? retryDelay * 2 : 2000, 60000);
    retryAt = Date.now() + retryDelay;
  }

  function pump() {
    if (Date.now() < retryAt || !settings.enabled) return;
    while (queue.size && inFlight < MAX_IN_FLIGHT) {
      const batch = [...queue.values()].slice(0, BATCH_SIZE);
      batch.forEach((p) => queue.delete(p.id));
      const gen = generation;
      inFlight++;
      chrome.runtime
        .sendMessage({ type: "classify", posts: batch })
        .then((resp) => {
          if (gen !== generation) return; // categories changed while this was in flight
          lastError = resp?.error || null;
          for (const [id, r] of Object.entries(resp?.results || {})) {
            results.set(id, r);
            document.querySelectorAll(`[data-jv-id="${id}"]`).forEach((el) => paint(el, r));
          }
          const failed = batch.filter((p) => !results.has(p.id));
          if (failed.length) {
            // Keep the page looking normal while we retry in the background.
            failed.forEach((p) => {
              queue.set(p.id, p);
              document.querySelectorAll(`[data-jv-id="${p.id}"]`).forEach((el) => (el.dataset.jvState = "waiting"));
            });
            backoff();
          } else {
            retryDelay = 0;
          }
        })
        .catch((e) => {
          if (!alive()) return shutdown();
          lastError = String(e?.message || e);
          if (gen === generation) batch.forEach((p) => queue.set(p.id, p));
          document.querySelectorAll("[data-jv-state='pending']").forEach((el) => (el.dataset.jvState = "waiting"));
          backoff();
        })
        .finally(() => {
          inFlight--;
          if (alive()) pump();
        });
    }
  }

  let scanTimer = null;
  function scheduleScan(delay = 300) {
    if (scanTimer || dead) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, delay);
  }

  // ---------- lifecycle ----------

  let observer = null;
  let interval = null;
  const onScroll = () => scheduleScan(150);

  function shutdown() {
    if (dead) return;
    dead = true;
    observer?.disconnect();
    clearInterval(interval);
    removeEventListener("scroll", onScroll);
    document.querySelectorAll("[data-jv-id]").forEach(clearEl);
  }

  function applySettings(next) {
    const categoriesChanged = Jev.categorySetKey(next) !== Jev.categorySetKey(settings);
    settings = next;
    if (categoriesChanged) {
      generation++;
      results = new Map();
      queue.clear();
      retryAt = 0;
      document.querySelectorAll("[data-jv-id]").forEach(clearEl);
      scheduleScan(0);
    }
    repaintAll();
    if (settings.enabled) pump();
  }

  Jev.load().then((s) => {
    settings = s;
    observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    addEventListener("scroll", onScroll, { passive: true });
    interval = setInterval(() => scheduleScan(0), 3000); // safety net, and retries after errors
    scan();
  });

  Jev.onChange((s) => alive() && applySettings(s));

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "pageStats") {
      const counts = {};
      document.querySelectorAll("[data-jv-state='done']").forEach((el) => {
        counts[el.dataset.jvCat] = (counts[el.dataset.jvCat] || 0) + 1;
      });
      sendResponse({
        counts,
        pending: document.querySelectorAll("[data-jv-state='pending']").length,
        error: lastError,
      });
    }
  });
})();
