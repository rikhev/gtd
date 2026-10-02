import { useSyncExternalStore } from "react";

/**
 * The phone layout (below 820px wide): a slimmer app (owner's request) with only the Inbox, the Calendar and the lists,
 * reached from a bottom bar. Wider screens, a tablet included, keep everything.
 */
const QUERY = "(max-width: 820px)";
const mq = typeof window !== "undefined" ? window.matchMedia(QUERY) : null;

export const isPhone = () => Boolean(mq?.matches);
export function usePhone(): boolean {
  return useSyncExternalStore(
    (f) => {
      mq?.addEventListener("change", f);
      return () => mq?.removeEventListener("change", f);
    },
    isPhone,
    () => false,
  );
}
