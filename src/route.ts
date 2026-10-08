/**
 * Each view has its own address, a plain path (owner's request: no "#" in them): /inbox, /projects, and inside a
 * checklist or a reference list /checklists/<id> and /reference/<id>. The server answers every path that isn't a file
 * or the API with the app, so a reload or a bookmark lands where it was. Back and Forward fire popstate as before.
 */

/** The address without its leading slash: "projects", "checklists/<id>", or "" at the root. */
export const routePath = () => window.location.pathname.replace(/^\/+/, "");

/** The view the address names: its first part. */
export const routeView = (path = routePath()) => path.split("/")[0];

/** Go to an address: a new history entry, or (replace) the current one rewritten. */
export function setRoute(path: string, replace = false) {
  const url = `/${path}`;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}
