// End-to-end: the real extension on Reddit pages, classified by the production jev-backend.
// The feed and search fixtures are served at https://www.reddit.com/ via request interception so the
// assertions are deterministic; then a live check runs on the real www.reddit.com/r/popular/
// (skipped, not failed, if Reddit blocks the headless browser).
import puppeteer from "puppeteer";
import fs from "node:fs";

const EXT = new URL("../extension", import.meta.url).pathname;
const feedHtml = fs.readFileSync(new URL("./fixture.html", import.meta.url), "utf8");
const searchHtml = fs.readFileSync(new URL("./fixture-search.html", import.meta.url), "utf8");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "✔" : "✖"} ${msg}`); if (!ok) failures++; };
const labelsOn = (page) => page.evaluate(() => [...document.querySelectorAll("[data-jv-id]")].map((el) => ({
  id: el.dataset.jvId, state: el.dataset.jvState, ad: el.localName === "shreddit-ad-post", cat: el.dataset.jvCat, label: el.dataset.jvLabel,
  title: (el.getAttribute("post-title") || el.querySelector("[data-testid='post-title-text']")?.textContent || "").trim() })));

async function fixturePage(browser) {
  const page = await browser.newPage();
  await page.bringToFront();
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin === "https://www.reddit.com") r.respond({ status: 200, contentType: "text/html", body: u.pathname.startsWith("/search") ? searchHtml : feedHtml });
    else r.continue();
  });
  return page;
}

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], defaultViewport: { width: 1280, height: 1400 } });
try {
  const sw = await (await browser.waitForTarget((t) => t.type() === "service_worker", { timeout: 10000 })).worker();
  const extId = new URL(sw.url()).host;
  await sleep(800);
  check((await browser.pages()).some((p) => p.url().endsWith("/welcome.html")), "welcome page opens on install");

  // ---------- feed fixture ----------
  const page = await fixturePage(browser);
  const t0 = Date.now();
  await page.goto("https://www.reddit.com/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("[data-jv-state=done]").length >= 9, { timeout: 30000, polling: 100 }).catch(() => {});
  console.log(`  labels on screen ${Date.now() - t0}ms after navigation`);
  const labels = await labelsOn(page);
  labels.forEach((l) => console.log(`    ${(l.label || l.state).padEnd(26)} ${l.title.slice(0, 70)}`));
  const byId = Object.fromEntries(labels.map((l) => [l.id, l]));
  check(labels.length === 9 && labels.every((l) => l.state === "done"), "all 9 posts labeled, nothing pending");
  check(byId.t3_1fx0a01?.cat === "ragebait", "driveway outrage post is ragebait");
  check(byId.t3_1fx0a02?.cat === "karma_farming", "cake-day 'upvote so he feels loved' is karma farming");
  check(byId.t3_1fx0a03?.cat === "ai_slop", "'complex tapestry of emotions' AITA is AI slop");
  check(byId.t3_1fx0a04?.cat === "low_effort", "'me when the monday hits' is low effort");
  check(byId.t3_1fx0a05?.cat === "self_promo", "the <shreddit-ad-post> is self-promo & ads");
  check(byId.t3_1fx0a06?.cat === "news", "EU fine link is news");
  check(byId.t3_1fx0a07?.cat === "helpful", "backdoor Roth walkthrough is helpful");
  check(byId.t3_1fx0a08?.cat === "discussion", "AskHistorians question is discussion");
  const painted = await page.$eval("[data-jv-state=done]", (el) => {
    const s = getComputedStyle(el), a = getComputedStyle(el, "::after");
    return s.outlineStyle !== "none" && a.content.length > 2 && s.getPropertyValue("--jv-color").trim() !== "";
  });
  check(painted, "posts get a colored outline and a label");
  await page.screenshot({ path: "feed.png" });

  // --- Blur: Reddit's own ad posts are certain, so they're blurred until clicked ---
  const adState = () => page.evaluate(() => {
    const el = document.querySelector("[data-jv-id='t3_1fx0a05']");
    return { mode: el.dataset.jvMode, revealed: !!el.dataset.jvRevealed, cover: getComputedStyle(el, "::before").content,
      blur: getComputedStyle(el, "::before").backdropFilter, url: location.href };
  });
  let ad = await adState();
  check(ad.mode === "blur" && ad.cover.includes("Ad · click to show") && ad.blur.includes("blur"), `Reddit ad is blurred behind a cover (${ad.mode}, ${ad.cover})`);
  const box = await page.evaluate(() => {
    const el = document.querySelector("[data-jv-id='t3_1fx0a05']");
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const urlBefore = ad.url;
  await page.mouse.click(box.x, box.y);
  await sleep(300);
  ad = await adState();
  check(ad.revealed && ad.cover === "none" && ad.url === urlBefore, "one click reveals the ad and doesn't navigate away");
  await sw.evaluate(async () => {
    const settings = await Jev.load();
    settings.categories.find((c) => c.id === "self_promo").mode = "box";
    await Jev.save(settings);
  });
  await sleep(500);
  const reblurred = await page.evaluate(() => {
    const el = document.querySelector("[data-jv-id='t3_1fx0a05']");
    delete el.dataset.jvRevealed;
    return el.dataset.jvMode;
  });
  check(reblurred === "blur", "Reddit ads stay blurred even when their category is set to Box");

  // ---------- search fixture ----------
  const search = await fixturePage(browser);
  await search.goto("https://www.reddit.com/search/?q=mechanical+keyboard", { waitUntil: "domcontentloaded" });
  await search.waitForFunction(() => document.querySelectorAll("[data-jv-state=done]").length >= 3, { timeout: 30000, polling: 100 }).catch(() => {});
  const found = await labelsOn(search);
  found.forEach((l) => console.log(`    ${(l.label || l.state).padEnd(26)} ${l.title.slice(0, 70)}`));
  check(found.length === 3 && found.every((l) => l.state === "done"), "search results are labeled too");

  // ---------- settings: hide a category live ----------
  const opts = await browser.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await opts.waitForSelector(".cat");
  check((await opts.$$(".cat")).length === 9, "9 default categories on the settings page");
  check((await opts.$$eval(".cat .modes", (m) => m[0].textContent)) === "BoxDimBlurHideOff", "settings offer a Blur mode");
  check(await opts.$eval("#blurSponsored", (e) => e.checked), "'Blur Reddit ads' is on by default");
  await opts.evaluate(() => {
    const li = [...document.querySelectorAll(".cat")].find((x) => x.querySelector(".name").value === "Ragebait");
    [...li.querySelectorAll(".modes button")].find((b) => b.textContent === "Hide").click();
  });
  await sleep(700);
  const hidden = await page.evaluate(() => {
    const els = [...document.querySelectorAll("[data-jv-cat='ragebait']")];
    return els.length > 0 && els.every((el) => getComputedStyle(el).display === "none");
  });
  check(hidden, "setting a category to Hide hides it on the open feed");
  const othersVisible = await page.evaluate(() => [...document.querySelectorAll("[data-jv-state=done]:not([data-jv-cat='ragebait'])")].every((el) => getComputedStyle(el).display !== "none"));
  check(othersVisible, "other categories stay visible");

  // ---------- settings: test a post ----------
  await opts.type("#testTitle", "Guide: replacing a leaking kitchen faucet cartridge in 20 minutes\n1. Shut off both supply valves under the sink and open the tap to drain pressure. 2. Pop the cap, remove the handle screw and the retaining nut. 3. Pull the old cartridge straight up and take it to the store to match it. 4. Grease the new O-rings with plumber's silicone, seat it with the hot side on the left, reassemble.");
  await opts.type("#testChannel", "r/DIY");
  await opts.click("#testForm button");
  await opts.waitForFunction(() => document.querySelector("#testResult .pill"), { timeout: 20000, polling: 200 }).catch(() => {});
  const verdict = await opts.$eval("#testResult .pill", (e) => e.textContent).catch(() => "");
  check(verdict === "Helpful", `test-a-post labels a how-to guide as Helpful (${verdict})`);
  await opts.screenshot({ path: "options.png", fullPage: true });

  // ---------- popup ----------
  const popup = await browser.newPage();
  await popup.setViewport({ width: 340, height: 560 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await sleep(600);
  const names = await popup.$$eval(".name", (els) => els.map((e) => e.textContent));
  check(names[0] === "Ragebait" && names.length === 10 && names.at(-1) === "Other", "popup lists Jevvit's categories");
  await popup.screenshot({ path: "popup.png" });

  // Put Ragebait back to Box before the live check.
  await opts.evaluate(() => {
    const li = [...document.querySelectorAll(".cat")].find((x) => x.querySelector(".name").value === "Ragebait");
    [...li.querySelectorAll(".modes button")].find((b) => b.textContent === "Box").click();
  });
  await sleep(500);

  // ---------- live reddit.com ----------
  const live = await browser.newPage();
  await live.bringToFront();
  await live.setUserAgent(UA);
  const resp = await live.goto("https://www.reddit.com/r/popular/", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
  const hasPosts = resp?.ok() && (await live.waitForSelector("shreddit-post", { timeout: 20000 }).then(() => true, () => false));
  if (!hasPosts) {
    console.log(`- live r/popular skipped (status ${resp?.status() ?? "none"}, no posts rendered)`);
  } else {
    await live.waitForFunction(() => document.querySelectorAll("[data-jv-state=done]").length >= 5, { timeout: 45000, polling: 100 }).catch(() => {});
    const ls = await labelsOn(live);
    ls.filter((l) => l.state === "done").slice(0, 12).forEach((l) => console.log(`    ${l.label.padEnd(26)} ${l.ad ? "[ad] " : ""}${l.title.slice(0, 70)}`));
    check(ls.filter((l) => l.state === "done").length >= 5, `live r/popular: posts labeled (${ls.filter((l) => l.state === "done").length} of ${ls.length} near the viewport)`);
    await live.screenshot({ path: "live.png" });
  }
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\ne2e: all checks passed");
process.exit(failures ? 1 : 0);
