// Screenshot + console-error harness: bun scripts/shot.ts [url] [outPng] [waitMs]
export {};
import puppeteer from "puppeteer-core";

const url = process.argv[2] ?? "http://localhost:1420";
const out = process.argv[3] ?? "d:/codes/game1/scripts/tmp/shot.png";
const waitMs = Number(process.argv[4] ?? 9000);

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--window-size=1280,800", "--force-device-scale-factor=1"],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const logs: string[] = [];
page.on("console", (m) => { if (["error", "warn"].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, waitMs));
// optional interactions via env
if (process.env.SHOT_EVAL) await page.evaluate(process.env.SHOT_EVAL);
if (process.env.SHOT_EVAL) await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: out as `${string}.png` });
console.log("saved", out);
console.log(logs.length ? logs.join("\n") : "(no console errors)");
await browser.close();
