import { flushSync } from "react-dom";
import { isEditable } from "./keys.ts";
import { today } from "../shared/dates.ts";

/*
 * Printing (owner's request): ⌘P (the browser's own, so "Save as PDF" makes a file) or ⌘K › Print prints where the
 * keys are. From a list it prints the list across a landscape page: its heading and count, its groups and rows, its
 * columns as on screen. From the details
 * pane it prints the item's details, the fields the pane shows. Either way on white, whatever the theme, and nothing
 * else of the app. The print layouts are in styles.css under html[data-print].
 */

export type PrintWhat = "list" | "detail";

let themeWas: string | undefined;
/** Prepares the page for the browser's print: which layout, the day it was printed, and a field being typed in left. */
export function preparePrint(what: PrintWhat) {
  const root = document.documentElement;
  // Paper is white: the light theme for the print, the theme on screen back after.
  themeWas = root.dataset.theme;
  root.dataset.theme = "light";
  // A field being written in is left first (saved, and a notes field shows its text as it reads).
  const a = document.activeElement;
  if (isEditable(a)) flushSync(() => (a as HTMLElement).blur());
  root.dataset.print = what;
  root.style.setProperty("--printed", `"Printed ${today()}"`);
}

export function endPrint() {
  const root = document.documentElement;
  if (themeWas === undefined) delete root.dataset.theme;
  else root.dataset.theme = themeWas;
  delete root.dataset.print;
  document.documentElement.style.removeProperty("--printed");
}
