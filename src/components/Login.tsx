import { useEffect, useRef, useState, type FormEvent } from "react";
import { load, useMeta } from "../store.ts";
import { Tape } from "./bits.tsx";

/** The only screen a signed-out visitor can reach. Password, then authenticator or recovery code. */
export function Login() {
  const meta = useMeta();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pw = useRef<HTMLInputElement>(null);

  useEffect(() => pw.current?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || !code.trim()) {
      setError(!password ? "Enter your password." : "Enter the code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, code }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Couldn't sign in.");
        setCode("");
        pw.current?.select();
        return;
      }
      if (typeof j.recoveryLeft === "number") {
        sessionStorage.setItem("gtd:recoveryLeft", String(j.recoveryLeft));
      }
      await load();
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="login-sheet" onSubmit={submit} aria-label="Sign in">
        <div className="login-head">
          <Tape size="md">In-tray</Tape>
        </div>
        {!meta.authConfigured ? (
          <p className="login-note">
            Login isn't set up on this server yet. On the server, run <code>npm run auth:setup</code> in the app folder, then reload this page.
          </p>
        ) : (
          <>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                ref={pw}
                className="field-text"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Code</span>
              <input
                className="field-text login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 digits, or a recovery code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="login-button" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
