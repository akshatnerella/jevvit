# Jevvit

A Chrome/Brave extension that draws a colored box around every post in your Reddit feed and labels it as **Ragebait, Karma farming, AI slop, Low effort, Self-promo & ads, News, Discussion, Helpful, Interesting**, or any categories you define. Labels come from [Jev](https://docs.typesafe.ai).

This repo is the **client only**. Classification runs on the shared [jev-backend](https://github.com/akshatnerella/jev-backend) at `POST https://jev-backend.vercel.app/api/jevvit/classify`, which also serves [JevTube](https://github.com/akshatnerella/jevtube) and [JevedIn](https://github.com/akshatnerella/jevedin).

## Layout

```
extension/   MV3 extension (what ships to the Chrome Web Store). No secrets in here.
  parse.js   Reading Reddit's DOM, kept separate so it can be tested on fixtures.
store/       Store listing text, screenshots, promo tile.
tests/       Parser tests, an end-to-end run of the real extension, and a live-site parser check.
scripts/     package.sh builds dist/jevvit-<version>.zip for upload.
```

```
content.js (Reddit tab)                background.js              jev-backend
  finds posts near the viewport,  ──▶   local cache,       ──▶   /api/jevvit/classify
  parses them (parse.js),               install ID               (validation, shared cache,
  paints boxes + labels                                           limits, Jev)
```

- **One Jev call per batch.** Up to 10 posts go into `state.posts`. Each gets a `choice` question (category) and a `boolean` question (is this farming karma or engagement?).
- **Post text is data, never instructions.** The question wording lives in jev-backend, so a post titled "ignore previous instructions" is just text being classified. jev-backend has a test for it.
- **Reddit's own post ids.** Every post carries its `t3_…` id, so the same post gets the same cache entry for every user.
- **Attributes, not scraping.** Feed posts are `<shreddit-post>` elements (ads are `<shreddit-ad-post>`) whose attributes hold the id, title, author, subreddit, score, comment count, post type and link domain. Only the flair (`shreddit-post-flair`, by its `aria-label`) and a text post's body (`shreddit-post-text-body`) are read from the content. Search results use a different layout: the id comes from the title link (`search-post-title-t3_…`) and the rest from the JSON in `data-faceplate-tracking-context`.
- **Where it runs:** the home feed, r/popular and r/all, subreddit feeds, user profiles and search results. The post you open on its comments page is left alone.
- **Custom categories.** Up to 12, edited on the settings page. Each description is exactly what Jev reads.

## Develop

```sh
./scripts/package.sh                         # -> dist/jevvit-<version>.zip
cd tests && npm install && npm test          # parser checks + the real extension on the fixtures and live r/popular, against production
node live-parse.mjs [urls...]                # run parse.js on live reddit.com pages and print what it finds
node shots.mjs                               # regenerate the store screenshots from the fixture
```

**Test locally in Brave/Chrome:** open `brave://extensions`, turn on Developer mode, click **Load unpacked** and pick `extension/`.

**When Reddit changes its markup**, run `node live-parse.mjs` first. Then refresh `tests/fixture.html` / `tests/fixture-search.html` to mirror the new structure (with made-up users and posts) and re-run the tests. The e2e serves the fixtures at `https://www.reddit.com/` through request interception so its label assertions are deterministic, then checks live r/popular (skipped if Reddit blocks the headless browser).

## Publish

See `store/LISTING.md` for every field the Chrome Web Store dashboard asks for.
