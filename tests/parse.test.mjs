// Parser checks: load the feed and search fixtures in a real browser and run extension/parse.js on them.
import puppeteer from "puppeteer";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
const parser = read("../extension/parse.js");
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "✔" : "✖"} ${msg}`); if (!ok) failures++; };

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
async function parse(html) {
  await page.setContent(html);
  await page.addScriptTag({ content: parser });
  return page.evaluate(() => JevvitParse.findPosts().map(JevvitParse.parsePost));
}

// ---------- feed ----------
const posts = await parse(read("./fixture.html"));
const byId = Object.fromEntries(posts.map((p) => [p.id, p]));
check(posts.length === 9 && posts.every(Boolean), `finds all 9 feed posts, ad included (${posts.length})`);
const [rage, cake, aita, meme, ad, news, roth, hist, movie] = posts;
check(rage.id === "t3_1fx0a01" && new Set(posts.map((p) => p.id)).size === 9, "ids are Reddit's own t3_ ids");
check(rage.title.startsWith("My neighbor parks") && rage.subreddit === "r/mildlyinfuriating", `title and subreddit from attributes (${rage.subreddit})`);
check(rage.author === "curbside_karen_hater" && rage.score === 24100 && rage.comments === 3120, "author, score and comment count from attributes");
check(rage.postType === "image" && rage.domain === "", `image post, Reddit-hosted media domain dropped (${rage.domain || "none"})`);
check(aita.body.startsWith("Throwaway for obvious reasons.") && aita.body.includes("So, Reddit, AITA?") && !aita.body.includes("\n"), "text-post body from the text body, flattened to one line");
check(aita.flair === "Not the A-hole" && roth.flair === "Retirement", `flair from its aria-label (${aita.flair})`);
check(aita.domain === "", "self-post domain dropped");
check(news.postType === "link" && news.domain === "reuters.example", `link posts keep their domain (${news.domain})`);
check(ad.promoted && posts.filter((p) => p.promoted).length === 1, "only the <shreddit-ad-post> is promoted");
check(ad.subreddit === "u/FocusFlowApp" && ad.score === null, `ad: advertiser profile as subreddit, no score (${ad.subreddit})`);
check(movie.spoiler && !movie.nsfw && !rage.spoiler, "spoiler flag from the attribute");
check(meme.body === "" && meme.flair === "", "posts without text or flair send empty fields");
check(byId.t3_1fx0a08 === hist && hist.body.includes("church bells"), "AskHistorians body parsed");

// ---------- search ----------
const results = await parse(read("./fixture-search.html"));
check(results.length === 3 && results.every(Boolean), `finds 3 search results in both layouts (${results.length})`);
const [quiet, first, deal] = results;
check(quiet.id === "t3_1sk0b01" && quiet.subreddit === "r/keyboards" && quiet.author === "clack_enjoyer", `preview layout: id, subreddit, author (${quiet.id} ${quiet.subreddit})`);
check(quiet.score === 312 && quiet.comments === 88, `votes and comments from the counter row (${quiet.score}/${quiet.comments})`);
check(quiet.body === "", "the matching-comment preview is not sent as the post body");
check(first.title === "first build!!! rate it" && first.id === "t3_1sk0b02" && deal.score === 560, "plain layout parsed");

// ---------- what isn't a feed post ----------
const skipped = await parse(`
  <shreddit-post id="t3_open1" view-context="CommentsPage" post-title="The post you opened"></shreddit-post>
  <shreddit-post id="t3_outer1" view-context="AggregateFeed" post-title="Crosspost">
    <shreddit-post id="t3_inner1" view-context="AggregateFeed" post-title="Embedded original"></shreddit-post>
  </shreddit-post>
  <shreddit-post id="t3_notitle" view-context="AggregateFeed"></shreddit-post>
  <shreddit-post id="bogus" view-context="AggregateFeed" post-title="Bad id"></shreddit-post>`);
check(skipped.filter(Boolean).map((p) => p.id).join() === "t3_outer1", `skips the comments-page post, embedded posts, untitled posts and bad ids (${skipped.filter(Boolean).map((p) => p.id)})`);

await browser.close();
console.log(failures ? `\n${failures} parser check(s) failed` : "\nparser: all checks passed");
process.exit(failures ? 1 : 0);
