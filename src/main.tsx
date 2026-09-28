import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// One family, variable in weight and width: the text at normal width, the labels condensed (font-stretch 75%).
import "@fontsource-variable/instrument-sans/wdth.css";
import "./styles.css";
import App from "./App.tsx";
import { Login } from "./components/Login.tsx";
import { load, signedOut, useMeta } from "./store.ts";
import { applyTheme } from "./theme.ts";

// The chosen theme is on <html> before anything renders, so the page never flashes the other one.
applyTheme();

// Any API call that comes back 401 means the session ended: show the sign-in screen.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const res = await nativeFetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (res.status === 401 && url.includes("/api/") && !url.includes("/api/auth/")) signedOut();
  return res;
};

void load();

function Root() {
  const meta = useMeta();
  if (!meta.loaded) return <div className="loading" aria-busy="true" />;
  if (meta.authRequired && !meta.signedIn) return <Login />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
