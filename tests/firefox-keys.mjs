import { Builder, Key } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const opts = new firefox.Options().windowSize({ width: 1440, height: 900 });
if (process.env.HEADLESS) opts.addArguments("-headless");
const d = await new Builder().forBrowser("firefox").setFirefoxOptions(opts).build();
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (s) => d.executeScript(`return (${s})`);
const press = async (...keys) => {
  const mods = keys.slice(0, -1);
  const last = keys[keys.length - 1];
  let a = d.actions({ async: true });
  for (const m of mods) a = a.keyDown(m);
  a = a.sendKeys(last);
  for (const m of mods.reverse()) a = a.keyUp(m);
  await a.perform();
  await sleep(250);
};
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
const title = () => js("document.querySelector('.viewtitle')?.textContent");
const rows = () => js("document.querySelectorAll('.row').length");

try {
  await d.get("http://localhost:5173/");
  await sleep(1500);
  await d.findElement({ css: "body" });
  check("loads with a focused row", Boolean(await js("document.querySelector('.row.is-focus')")));

  await press(Key.ARROW_DOWN);
  await press(Key.ARROW_DOWN);
  const r0 = await rows();
  await press("e");
  await sleep(700);
  const r1 = await rows();
  check("E marks done and the row folds away", r1 === r0 - 1, `${r0} → ${r1}`);
  await press(Key.META, "z");
  check("⌘Z undo restores it", (await rows()) === r0, `${await rows()}`);

  await press(Key.BACK_SPACE);
  check("Del (Backspace) trashes", (await rows()) === r0 - 1);
  await press(Key.META, "z");
  check("⌘Z undo after trash", (await rows()) === r0);

  await press("c");
  check("C opens the context picker", (await js("document.querySelector('.picker-title')?.textContent")) === "Context");
  await press(Key.ESCAPE);
  check("Esc closes the picker", !(await js("document.querySelector('.picker')")));

  await press(Key.ALT, "v");
  check("⌥V opens the view menu", (await js("document.querySelector('.picker-title')?.textContent")) === "View");
  await press(Key.ESCAPE);

  const flagged0 = await js("document.querySelectorAll('.marker.is-flagged').length");
  await press(Key.CONTROL, "i");
  const flagged1 = await js("document.querySelectorAll('.marker.is-flagged').length");
  check("⌃I flags for today", flagged1 !== flagged0, `${flagged0} → ${flagged1}`);
  await press(Key.INSERT);
  check("Insert toggles the flag back", (await js("document.querySelectorAll('.marker.is-flagged').length")) === flagged0);

  // The rail's first group is ⌃1–6; the second group and the Trash are ⌃⇧1–6.
  for (const [n, name] of [["1", "Inbox"], ["2", "Calendar"], ["3", "Next Actions"], ["4", "Waiting For"], ["5", "Agendas"], ["6", "Projects"]]) {
    await press(Key.CONTROL, n);
    check(`⌃${n} → ${name}`, (await title()) === name, await title());
  }
  for (const [n, name] of [["1", "Someday / Maybe"], ["2", "Reference"], ["3", "Checklists"], ["4", "Horizons"], ["5", "Done"], ["6", "Trash"]]) {
    await press(Key.CONTROL, Key.SHIFT, n);
    check(`⌃⇧${n} → ${name}`, (await title()) === name, await title());
  }

  await press(Key.SHIFT, "n");
  check("⇧N focuses capture", (await js("document.activeElement?.className")) === "capture-input");
  const inbox0 = Number(await js("document.querySelector('.tray-count').textContent"));
  await d.actions({ async: true }).sendKeys("test capture from firefox").perform();
  await press(Key.ENTER);
  await sleep(300);
  check("Enter files the capture", Number(await js("document.querySelector('.tray-count').textContent")) === inbox0 + 1);
  check("capture line stays open", (await js("document.activeElement?.className")) === "capture-input");
  await press(Key.ESCAPE);

  await press(Key.META, "k");
  check("⌘K opens the palette (not Firefox web search)", Boolean(await js("document.querySelector('.palette')")));
  await press(Key.ESCAPE);

  await press(Key.ALT, "q");
  check("⌥Q focuses search", (await js("document.activeElement?.getAttribute('aria-label')")) === "Search everything");
  await press(Key.ESCAPE);

  await press("?");
  check("? opens the shortcut overlay", Boolean(await js("document.querySelector('.help')")));
  await press(Key.ESCAPE);

  await press(Key.ALT, Key.TAB);
  check("⌥Tab moves to the rail", (await js("document.querySelector('.app').dataset.region")) === "rail");
  await press(Key.ALT, Key.TAB);
  check("⌥Tab moves back to the list", (await js("document.querySelector('.app').dataset.region")) === "list");
  await press(Key.CONTROL, Key.F6);
  check("⌃F6 also cycles regions", (await js("document.querySelector('.app').dataset.region")) === "rail");
  await press(Key.ESCAPE);

  await press(Key.ENTER);
  check("Enter opens details", (await js("document.querySelector('.app').dataset.region")) === "detail");
  await press(Key.ESCAPE);
  check("Esc returns to the list", (await js("document.querySelector('.app').dataset.region")) === "list");

  await press("k");
  await sleep(1200);
  check("K opens Clarify", (await title()) === "Clarify");
  check("Clarify focus lands on the decision row", (await js("document.activeElement?.dataset?.row")) === "0");
  await press("c");
  check("C works immediately in Clarify", (await js("document.querySelector('.picker-title')?.textContent")) === "Context");
  await press(Key.ESCAPE);
  await press(Key.F2);
  check("F2 edits the action title", (await js("document.activeElement?.className")) === "p-title");
  await press(Key.ESCAPE);
  check("Esc from the title returns to the row", (await js("document.activeElement?.dataset?.row")) === "0");
  await press(Key.ARROW_DOWN);
  check("↓ moves to the next action row", (await js("document.activeElement?.dataset?.row")) === "1");
  await press(Key.CONTROL, ".");
  check("⌃. skips to the next item", (await js("document.querySelector('.clarify-progress .num').textContent.trim().startsWith('2')")));
  await press(Key.META, Key.ENTER);
  await sleep(400);
  check("⌘↵ accepts the decision", (await js("document.querySelector('.status-msg').textContent")).startsWith("Clarified"));
  await press(Key.ESCAPE);
  check("Esc on the row leaves Clarify", (await title()) === "Inbox", await title());

  await press("w");
  await sleep(800);
  await press(Key.CONTROL, ".");
  check("W + ⌃. opens Review at Projects", (await js("document.querySelector('.review-title').textContent")) === "Projects");
} catch (e) {
  results.push(`ERROR ${e.message}`);
} finally {
  const caps = await d.getCapabilities();
  console.log(`Firefox ${caps.get("browserVersion")} on ${caps.get("platformName")}`);
  console.log(results.join("\n"));
  await d.quit();
}
