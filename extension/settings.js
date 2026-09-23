// Shared settings model. Loaded by the service worker, content script, popup, options and welcome pages.
// Settings live in chrome.storage.sync so they follow the user across their browsers.
(() => {
  const MAX_CATEGORIES = 12; // user categories, not counting the fixed "other"
  const MAX_LABEL = 24;
  const MAX_DESCRIPTION = 240;
  const MODES = ["box", "dim", "hide", "off"];

  // The description is exactly what Jev reads for that option, so it has to stand on its own.
  const DEFAULT_CATEGORIES = [
    { id: "ragebait", label: "Ragebait", color: "#e11d48", mode: "box",
      description: "A post built to make people angry: outrage headlines, 'people who do X are the worst', culture-war provocation, clips stripped of context to start a fight, entitled-person stories told to farm fury." },
    { id: "karma_farming", label: "Karma farming", color: "#f59e0b", mode: "box",
      description: "Reposts and cheap content made for upvotes: recycled viral images and videos, 'upvote if', 'my cake day', sob-story or pet pics posted for sympathy, the same post spammed across many subreddits." },
    { id: "ai_slop", label: "AI slop", color: "#a21caf", mode: "box",
      description: "AI-generated content: AI images or video passed off as real or as the poster's art, generic ChatGPT-written stories and confessions, hollow LLM prose with no specifics." },
    { id: "low_effort", label: "Low effort", color: "#ea580c", mode: "box",
      description: "Memes, shitposts, reaction images and jokes, and one-line questions with no context that a quick search would answer. Little thought went into it." },
    { id: "self_promo", label: "Self-promo & ads", color: "#0d9488", mode: "box",
      description: "Advertising: promoted or sponsored posts, and users pushing their own product, app, channel, newsletter, course, store or affiliate link." },
    { id: "news", label: "News", color: "#2563eb", mode: "box",
      description: "Reports of real events: links to news articles, breaking news, official announcements, product launches, court rulings, research results." },
    { id: "discussion", label: "Discussion", color: "#8b5cf6", mode: "box",
      description: "A genuine question or conversation starter with real context, or a personal experience shared in good faith, that invites thoughtful replies." },
    { id: "helpful", label: "Helpful", color: "#16a34a", mode: "box",
      description: "Useful, substantive content: guides, tutorials, detailed answers, deep dives, data and analysis, well-sourced explanations, resource lists." },
    { id: "interesting", label: "Interesting", color: "#0891b2", mode: "box",
      description: "Something genuinely worth a look: striking original photos, impressive skills or builds, remarkable facts, history or nature." },
  ];

  // Always present, always last. Jev picks it when none of the user's categories fit.
  const OTHER = { id: "other", label: "Other", color: "#6b7280", mode: "off", fixed: true,
    description: "None of the other categories fit this post." };

  // One-click additions shown on the settings page.
  const SUGGESTIONS = [
    { label: "Politics", description: "Political news and commentary, partisan opinion, elections and culture-war debates." },
    { label: "Drama", description: "Interpersonal drama and conflict stories: AITA posts, relationship and family fights, workplace feuds, internet beef between users or creators." },
    { label: "Spoilers", description: "Posts that reveal or discuss plot details of movies, shows, games or books, including posts marked as spoilers." },
    { label: "NSFW", description: "Posts marked NSFW, or with sexual, graphic or gory content." },
    { label: "Doom", description: "Bleak and distressing content: disasters, violence, tragedies and hopeless takes that leave you feeling worse." },
    { label: "Crypto", description: "Crypto, web3, tokens, trading and blockchain promotion or commentary." },
    { label: "Stock tips", description: "Investing and trading hype: stock picks, options gains and loss screenshots, meme stocks, 'to the moon' posts." },
    { label: "Cute animals", description: "Photos and videos of pets and animals being cute or funny." },
    { label: "Tech support", description: "Someone asking for help fixing a device, program, build or error." },
    { label: "Celebrity", description: "Celebrity gossip, influencers and famous people's personal lives." },
    { label: "Sports", description: "Sports results, highlights, trades, players and fan discussion." },
    { label: "Gaming", description: "Video games: clips, news, reviews, memes and discussion about games." },
  ];

  const PALETTE = ["#e11d48", "#f59e0b", "#2563eb", "#16a34a", "#8b5cf6", "#ec4899", "#0d9488",
                   "#ea580c", "#0891b2", "#65a30d", "#c026d3", "#4f46e5", "#b45309"];

  const DEFAULT_SETTINGS = {
    version: 2,
    enabled: true,
    showConfidence: true,
    showBait: true,
    lowConfidence: 0.55,
    categories: DEFAULT_CATEGORIES,
    otherMode: "off",
  };

  const clone = (x) => JSON.parse(JSON.stringify(x));

  function slug(label) {
    return (label || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "category";
  }

  function uniqueId(label, taken) {
    const base = slug(label);
    let id = base === "other" ? "other_" : base;
    for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
    return id;
  }

  // Coerce anything (old versions, hand-edited storage) into a valid settings object.
  function normalize(raw) {
    const s = { ...clone(DEFAULT_SETTINGS), ...(raw || {}) };
    if (!MODES.includes(s.otherMode)) s.otherMode = "off";
    s.lowConfidence = Math.min(0.95, Math.max(0, Number(s.lowConfidence) || 0));
    const taken = new Set(["other"]);
    const cats = Array.isArray(s.categories) ? s.categories : clone(DEFAULT_CATEGORIES);
    s.categories = cats
      .filter((c) => c && typeof c.label === "string" && c.label.trim())
      .slice(0, MAX_CATEGORIES)
      .map((c, i) => {
        const id = c.id && /^[a-z0-9_]{1,24}$/.test(c.id) && !taken.has(c.id) ? c.id : uniqueId(c.label, taken);
        taken.add(id);
        return {
          id,
          label: c.label.trim().slice(0, MAX_LABEL),
          description: String(c.description || c.label).trim().slice(0, MAX_DESCRIPTION),
          color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : PALETTE[i % PALETTE.length],
          mode: MODES.includes(c.mode) ? c.mode : "box",
        };
      });
    return s;
  }

  async function load() {
    const { settings } = await chrome.storage.sync.get("settings");
    return normalize(settings || null);
  }

  async function save(settings) {
    const s = normalize(settings);
    await chrome.storage.sync.set({ settings: s });
    return s;
  }

  function onChange(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.settings) cb(normalize(changes.settings.newValue));
    });
  }

  // Everything the classifier sees, in a stable order. Changing any of it means re-labeling.
  function classifierCategories(settings) {
    return [...settings.categories.map(({ id, description }) => ({ id, description })), { id: OTHER.id, description: OTHER.description }];
  }

  function categorySetKey(settings) {
    const str = JSON.stringify(classifierCategories(settings));
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // Display info for a category id, including the fixed "other" and stale ids.
  function lookup(settings, id) {
    const c = settings.categories.find((x) => x.id === id);
    if (c) return c;
    return { ...OTHER, mode: settings.otherMode };
  }

  self.Jev = {
    MAX_CATEGORIES, MAX_LABEL, MAX_DESCRIPTION, MODES, DEFAULT_CATEGORIES, OTHER, SUGGESTIONS, PALETTE,
    DEFAULT_SETTINGS, clone, slug, uniqueId, normalize, load, save, onChange,
    classifierCategories, categorySetKey, lookup,
  };
})();
