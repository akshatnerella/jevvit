// Service worker: sends visible posts to the Jev backend and caches the labels.
// No API keys live in the extension; the backend holds them and rate-limits per install.
importScripts("config.js", "settings.js");

const CLASSIFY_URL = self.JEV_ENDPOINT;
const CACHE_KEY = "classCache";
const CACHE_MAX = 5000;
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

let cache = null; // "<categorySetKey>:<postId>" -> { category, confidence, probabilities, bait, ts }
let lastError = null;
let limitedUntil = 0; // after a 429, stop calling the backend until this time

async function getInstallId() {
  const { installId } = await chrome.storage.local.get("installId");
  if (installId) return installId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ installId: id });
  return id;
}

async function loadCache() {
  if (cache) return cache;
  const stored = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {};
  const now = Date.now();
  cache = Object.fromEntries(Object.entries(stored).filter(([, v]) => now - v.ts < CACHE_TTL_MS));
  return cache;
}

let saveTimer = null;
function saveCacheSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const entries = Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts).slice(0, CACHE_MAX);
    cache = Object.fromEntries(entries);
    chrome.storage.local.set({ [CACHE_KEY]: cache });
  }, 1000);
}

async function classify(posts) {
  await loadCache();
  const settings = await Jev.load();
  const setKey = Jev.categorySetKey(settings);
  const results = {};
  const todo = [];
  for (const p of posts) {
    const hit = cache[`${setKey}:${p.id}`];
    if (hit) results[p.id] = hit;
    else if (!todo.some((t) => t.id === p.id)) todo.push(p);
  }
  if (!todo.length) return { results };
  if (Date.now() < limitedUntil) return { results, error: lastError };

  try {
    const res = await fetch(CLASSIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installId: await getInstallId(),
        posts: todo,
        categories: Jev.classifierCategories(settings),
      }),
    });
    const data = await res.json().catch(() => ({}));
    for (const [id, r] of Object.entries(data.results || {})) {
      const entry = { ...r, ts: Date.now() };
      cache[`${setKey}:${id}`] = entry;
      results[id] = entry;
    }
    saveCacheSoon();
    if (typeof data.remaining === "number") chrome.storage.local.set({ remaining: data.remaining });
    if (res.status === 429) {
      lastError = data.error || "Daily limit reached.";
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
      limitedUntil = midnight.getTime();
    } else if (!res.ok) {
      lastError = data.error || `Server error (${res.status}). Retrying shortly.`;
    } else {
      lastError = null;
    }
    return { results, error: lastError };
  } catch (e) {
    lastError = "Can't reach the Jevvit server. Retrying shortly.";
    return { results, error: lastError };
  }
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await Jev.load();
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-jevvit") return;
  const settings = await Jev.load();
  settings.enabled = !settings.enabled;
  await Jev.save(settings);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "classify") {
    classify(msg.posts).then(sendResponse);
    return true;
  }
  if (msg.type === "status") {
    chrome.storage.local.get("remaining").then(({ remaining }) =>
      sendResponse({ lastError, limited: Date.now() < limitedUntil, remaining })
    );
    return true;
  }
  if (msg.type === "clearCache") {
    cache = {};
    chrome.storage.local.remove(CACHE_KEY).then(() => sendResponse({ ok: true }));
    return true;
  }
});
