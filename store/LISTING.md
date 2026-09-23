# Chrome Web Store submission kit

Upload `dist/jevvit-<version>.zip` (build it with `./scripts/package.sh`) at
https://chrome.google.com/webstore/devconsole, then paste the fields below.

## Store listing

**Name** (comes from the manifest): Jevvit: Cut the Slop from Reddit

**Summary** (132 chars max):
Color-codes every Reddit post as ragebait, karma farming, AI slop or your own categories, so you can skip the noise.

**Category:** Productivity. Language: English.

**Description:**

Your Reddit feed is full of outrage bait, reposted karma grabs, AI-written stories and ads dressed up as posts. Jevvit puts a colored box around every post and tells you what it really is, so you can skip straight to the posts worth reading.

WHAT IT LABELS
• Ragebait: outrage headlines and posts built to start a fight
• Karma farming: reposts, "upvote if", cake-day and sympathy grabs
• AI slop: AI images passed off as real, ChatGPT-written stories
• Low effort: memes, shitposts, one-line questions
• Self-promo & ads: promoted posts and people pushing their own stuff
• News: articles and reports of real events
• Discussion: genuine questions and conversations
• Helpful: guides, detailed answers, deep dives
• Interesting: striking photos, impressive builds, remarkable facts

MAKE YOUR OWN CATEGORIES
Want to spot politics, spoilers or stock-tip hype? Add up to 12 categories of your own, describe them in plain English, and Jevvit sorts your feed by them. Paste any post on the settings page to see how it would be labeled.

LOCK IN
Reddit ads are blurred behind a "click to show" cover, so they don't pull your attention. One click reveals one.

YOU'RE IN CONTROL
Set each category to box, dim, blur, hide or off. Hide ragebait entirely, dim low-effort memes, keep the helpful posts front and center. A dashed box means the model is unsure, and hovering any label shows the full breakdown. Works on your home feed, r/popular, subreddits and search results. Toggle Jevvit anywhere with Alt+Shift+R.

PRIVATE BY DESIGN
• No account or sign-in
• Reads only the posts shown in your Reddit feeds
• Never touches your messages, votes, comments, profile or any other website

Powered by Jev, a fast decision model from TypeSafe AI. Jevvit is an independent tool and is not affiliated with or endorsed by Reddit.

**Screenshots** (1280×800): `store/screenshot-1-feed.png`, `store/screenshot-2-settings.png`, `store/screenshot-3-welcome.png`
**Small promo tile** (440×280): `store/promo-small-440x280.png`
**Icon:** included in the zip (`icons/icon128.png`)

## Privacy practices tab

**Single purpose:**
Label the posts in a user's Reddit feeds by type (ragebait, karma farming, AI slop, low effort, self-promotion and ads, news, discussion, helpful, interesting, or user-defined categories) so users can spot and optionally dim or hide them.

**Permission justifications:**
- `storage`: saves the user's settings and custom categories (synced across their browsers), a random install ID used for fair-use rate limiting, and a local cache of labels so posts aren't re-checked.
- Host permission `https://jev-backend.vercel.app/*`: the extension's own backend, which labels the posts. No other hosts are contacted.
- Content script on `www.reddit.com`: reads the public details of the posts shown in feeds and search results and draws the labels on the page.

**Remote code:** No, I am not using remote code. (All JS is in the package; the backend returns JSON labels only.)

**Data usage disclosures** (tick these):
- "Website content": yes. Public details of feed posts (Reddit post id, title, the start of the post text, subreddit, author username, flair, post type, link domain, score and comment count, ad/NSFW/spoiler flags) are sent to the backend to produce labels, together with the user's category names/descriptions.
- Everything else (personally identifiable info, health, financial, authentication, personal communications, location, web history, user activity): **not collected**.

Certify all three: data is not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness or lending.

**Privacy policy URL:** https://jev-backend.vercel.app/jevvit/privacy.html

**Homepage URL:** https://jev-backend.vercel.app

## Distribution
Public, all regions. Brave, Edge, Arc, Opera and Vivaldi users install from the same Chrome Web Store listing.
