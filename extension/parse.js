// Reading Reddit's feed DOM. Kept separate from the rest of the extension so it can be
// tested against a saved feed fixture (see tests/parse.test.mjs).
//
// www.reddit.com renders each feed post as a <shreddit-post> custom element (ads as
// <shreddit-ad-post>) whose attributes carry almost everything: the post id, title, author,
// subreddit, score, comment count, post type and link domain. Attributes are Reddit's own data
// model, so they're far more stable than its Tailwind class names; text is read only for the
// flair and the text-post body. Search results use a different layout (see parseSearchResult).
// Verified against the live site (logged out) in September 2026.
(() => {
  const FEED_POST = "shreddit-post, shreddit-ad-post";
  // Search results come in two layouts: plain, and with a matching-comment preview.
  const SEARCH_POST = '[data-testid="search-post-unit"], [data-testid="search-post-with-content-preview"]';
  const SEARCH_TITLE = '[data-testid="post-title-text"]';
  const POST_ID = /^t3_[a-z0-9]{1,13}$/;
  // The post you opened (its comments page) isn't a feed item; labeling or hiding it would get in the way.
  const SKIP_CONTEXTS = new Set(["CommentsPage"]);

  const oneLine = (s) => (s || "").replace(/\s+/g, " ").trim();
  const num = (s) => (s != null && s !== "" && Number.isFinite(Number(s)) ? Math.trunc(Number(s)) : null);

  function findPosts(root = document) {
    return [...root.querySelectorAll(`${FEED_POST}, ${SEARCH_POST}`)].filter(isPost);
  }

  function isPost(el) {
    if (el.matches(SEARCH_POST)) return POST_ID.test(searchPostId(el));
    if (el.parentElement?.closest(FEED_POST)) return false; // a post embedded in another (crosspost)
    return !SKIP_CONTEXTS.has(el.getAttribute("view-context")) && POST_ID.test(feedPostId(el));
  }

  // Posts are block-level elements with their own size, so the box goes on the post itself.
  const paintTarget = (el) => el;

  function feedPostId(el) {
    const id = el.getAttribute("id") || "";
    return POST_ID.test(id) ? id : el.getAttribute("post-id") || "";
  }

  // Link posts keep their domain; text posts ("self.AskReddit") and Reddit-hosted media don't need it.
  function linkDomain(domain) {
    const d = (domain || "").toLowerCase();
    if (!d || d.startsWith("self.") || /(^|\.)(redd\.it|reddit\.com|redditmedia\.com)$/.test(d)) return "";
    return d;
  }

  function subredditOf(el) {
    const prefixed = el.getAttribute("subreddit-prefixed-name");
    if (prefixed) return prefixed;
    const name = el.getAttribute("subreddit-name") || "";
    if (!name) return "";
    return name.startsWith("u_") ? `u/${name.slice(2)}` : `r/${name}`; // ads post from the advertiser's profile
  }

  function parseFeedPost(el) {
    const a = (n) => el.getAttribute(n);
    const title = oneLine(a("post-title") || el.querySelector('[slot="title"]')?.textContent);
    const flairEl = el.querySelector("shreddit-post-flair");
    const flairLabel = flairEl?.querySelector('[aria-label^="Flair:"]')?.getAttribute("aria-label");
    const bodyEl = el.querySelector('shreddit-post-text-body [property="schema:articleBody"], shreddit-post-text-body');
    return {
      id: feedPostId(el),
      title,
      body: oneLine(bodyEl?.textContent).slice(0, 1200),
      subreddit: subredditOf(el),
      author: a("author") || "",
      flair: oneLine(flairLabel ? flairLabel.replace(/^Flair:\s*/, "") : flairEl?.textContent),
      postType: a("post-type") || "",
      domain: linkDomain(a("domain")),
      score: num(a("score")),
      comments: num(a("comment-count")),
      promoted: el.localName === "shreddit-ad-post" || el.hasAttribute("promoted"),
      nsfw: el.hasAttribute("nsfw"),
      spoiler: el.hasAttribute("spoiler"),
    };
  }

  // Search results: the id is in the title link's id ("search-post-title-t3_…"), and the rest of
  // the post's data is JSON in a telemetry attribute, inside the result or on a wrapper around it.
  function searchPostId(el) {
    return (el.querySelector(SEARCH_TITLE)?.id || "").replace(/^search-post-title-/, "");
  }

  function searchContext(el, id) {
    const candidates = [...el.querySelectorAll("[data-faceplate-tracking-context]")];
    for (let up = el.parentElement?.closest("[data-faceplate-tracking-context]"), i = 0; up && i < 3; up = up.parentElement?.closest("[data-faceplate-tracking-context]"), i++) candidates.push(up);
    for (const t of candidates) {
      try {
        const ctx = JSON.parse(t.getAttribute("data-faceplate-tracking-context"));
        if (ctx?.post?.id === id) return ctx;
      } catch {}
    }
    return {};
  }

  function parseSearchResult(el) {
    const id = searchPostId(el);
    const ctx = searchContext(el, id);
    const post = ctx.post || {};
    const counts = {};
    el.querySelectorAll('[data-testid="search-counter-row"] > *').forEach((span) => {
      const n = num(span.querySelector("faceplate-number")?.getAttribute("number"));
      const m = span.textContent.match(/\b(votes?|comments?)\b/);
      if (n != null && m) counts[m[1].startsWith("vote") ? "score" : "comments"] = n;
    });
    return {
      id,
      title: oneLine(post.title || el.querySelector(SEARCH_TITLE)?.textContent),
      body: "",
      subreddit: ctx.subreddit?.name ? `r/${ctx.subreddit.name}` : "",
      author: ctx.profile?.name || "",
      flair: "",
      postType: "",
      domain: "",
      score: counts.score ?? null,
      comments: counts.comments ?? null,
      promoted: false,
      nsfw: post.nsfw === true,
      spoiler: post.spoiler === true,
    };
  }

  function parsePost(el) {
    const p = el.matches(SEARCH_POST) ? parseSearchResult(el) : parseFeedPost(el);
    return POST_ID.test(p.id) && p.title ? p : null;
  }

  self.JevvitParse = { FEED_POST, SEARCH_POST, findPosts, isPost, parsePost, paintTarget, linkDomain };
})();
