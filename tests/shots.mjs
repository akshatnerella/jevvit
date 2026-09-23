// Store screenshots (1280x800): the fixture feed with labels, the settings page, the welcome page.
// Uses the made-up fixture posts, so no real person's content ends up in the listing.
import puppeteer from "puppeteer";
import fs from "node:fs";
const EXT = new URL("../extension", import.meta.url).pathname;
const fixture = fs.readFileSync(new URL("./fixture.html", import.meta.url), "utf8");
const out = (n) => new URL(`../store/${n}`, import.meta.url).pathname;
const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], defaultViewport: { width: 1280, height: 800 } });
const sw = await (await browser.waitForTarget((t) => t.type() === "service_worker")).worker();
const id = new URL(sw.url()).host;
const feed = await browser.newPage();
await feed.bringToFront();
await feed.setRequestInterception(true);
feed.on("request", (r) => r.url().startsWith("https://www.reddit.com/") ? r.respond({ status: 200, contentType: "text/html", body: fixture }) : r.continue());
await feed.goto("https://www.reddit.com/", { waitUntil: "domcontentloaded" });
// Frame the AI slop, meme, ad and news posts, and wait for every post in view to be labeled.
await feed.evaluate(() => window.scrollTo(0, document.querySelector("#t3_1fx0a03").getBoundingClientRect().top + scrollY - 30));
await feed.waitForFunction(() => document.querySelectorAll("[data-jv-id]").length >= 5 && !document.querySelector("[data-jv-state=pending]"), { timeout: 30000, polling: 100 });
await feed.screenshot({ path: out("screenshot-1-feed.png") });
const opts = await browser.newPage();
await opts.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await opts.goto(`chrome-extension://${id}/options.html`);
await opts.waitForSelector(".cat");
await opts.type("#testTitle", "My neighbor keeps parking in MY spot and today she had the nerve to leave a note. Entitled people like this are ruining this country.");
await opts.type("#testChannel", "r/mildlyinfuriating");
await opts.click("#testForm button");
await opts.waitForSelector("#testResult .pill", { timeout: 20000 }).catch(() => {});
await opts.evaluate(() => { const el = document.querySelector("#testResult"); window.scrollTo(0, el.getBoundingClientRect().bottom + scrollY - 760); });
await opts.screenshot({ path: out("screenshot-2-settings.png") });
const w = await browser.newPage();
await w.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await w.goto(`chrome-extension://${id}/welcome.html`);
await w.screenshot({ path: out("screenshot-3-welcome.png") });
await browser.close();
