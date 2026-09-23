// Run extension/parse.js against live www.reddit.com pages (logged out) and print what it extracts.
// Use it when Reddit changes its markup:  node live-parse.mjs https://www.reddit.com/r/popular/ ...
import puppeteer from "puppeteer";
import fs from "node:fs";

const parser = fs.readFileSync(new URL("../extension/parse.js", import.meta.url), "utf8");
const urls = process.argv.slice(2).length ? process.argv.slice(2)
  : ["https://www.reddit.com/", "https://www.reddit.com/r/movies/", "https://www.reddit.com/search/?q=mechanical+keyboard"];
const browser = await puppeteer.launch({ headless: true });
for (const url of urls) {
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1280, height: 1400 });
  const resp = await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => null);
  await page.evaluate(() => window.scrollBy(0, 2500));
  await new Promise((r) => setTimeout(r, 2000));
  await page.addScriptTag({ content: parser });
  const posts = await page.evaluate(() => JevvitParse.findPosts().map(JevvitParse.parsePost));
  const ok = posts.filter(Boolean);
  console.log(`\n${url}  (HTTP ${resp?.status() ?? "none"})  ${posts.length} posts, ${posts.length - ok.length} unparsed, ` +
    `${ok.filter((p) => p.body).length} with body, ${ok.filter((p) => p.flair).length} with flair, ${ok.filter((p) => p.promoted).length} ads`);
  for (const p of ok.slice(0, 8)) {
    console.log(`  ${p.id.padEnd(12)} ${(p.postType || "-").padEnd(9)} ${p.subreddit.padEnd(22)} ${p.promoted ? "[ad] " : ""}${p.title.slice(0, 60)}`);
  }
  await page.close();
}
await browser.close();
