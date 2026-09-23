// Records docs/demo.gif for the README: the real extension on the made-up feed fixture (no real
// people's posts), labels arriving live, the ad blurred, then a click revealing it.
import puppeteer from "puppeteer";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const EXT = new URL("../extension", import.meta.url).pathname;
const feedHtml = fs.readFileSync(new URL("./fixture.html", import.meta.url), "utf8");
const frames = fs.mkdtempSync("/tmp/jevvit-demo-");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], defaultViewport: { width: 900, height: 820, deviceScaleFactor: 1 } });
await browser.waitForTarget((t) => t.type() === "service_worker");
const page = await browser.newPage();
await page.bringToFront();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await page.setRequestInterception(true);
page.on("request", (r) => (new URL(r.url()).origin === "https://www.reddit.com" ? r.respond({ status: 200, contentType: "text/html", body: feedHtml }) : r.continue()));

let n = 0;
const shot = async (count = 1, gap = 100) => {
  for (let i = 0; i < count; i++) {
    await page.screenshot({ path: `${frames}/f${String(n++).padStart(4, "0")}.png` });
    await sleep(gap);
  }
};

// Force a fresh classification so labels visibly arrive.
await page.goto("https://www.reddit.com/", { waitUntil: "domcontentloaded" });
await shot(6, 120); // raw feed, then labels landing
await page.waitForFunction(() => document.querySelectorAll("[data-jv-state=done]").length >= 5, { timeout: 30000, polling: 100 });
await shot(14, 120); // labeled feed
for (let y = 0; y <= 1; y++) { // scroll down to the blurred ad
  await page.evaluate(() => document.querySelector("[data-jv-id='t3_1fx0a05']").scrollIntoView({ block: "center", behavior: "instant" }));
}
await shot(16, 120);
const box = await page.evaluate(() => {
  const r = document.querySelector("[data-jv-id='t3_1fx0a05']").getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(box.x, box.y);
await shot(4, 120);
await page.mouse.click(box.x, box.y); // reveal
await shot(14, 120);
await browser.close();

const out = new URL("../docs/demo.gif", import.meta.url).pathname;
fs.mkdirSync(new URL("../docs", import.meta.url).pathname, { recursive: true });
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "8", "-i", `${frames}/f%04d.png`, "-vf",
  "scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
  "-loop", "0", out]);
fs.rmSync(frames, { recursive: true });
console.log(`wrote ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB, ${n} frames)`);
