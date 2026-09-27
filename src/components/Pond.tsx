import { useEffect, useRef } from "react";

/**
 * Mind like water: the head of the rail is a still surface. Each thing that lands in the Inbox
 * falls in as a drop; its rings spread in perspective and die out until the water is smooth again.
 * The calm surface is plain CSS; this canvas only draws while something is moving, then stops.
 */

const HORIZON = 43; // px from the top: steel "air" above, water below; level with the top bar's bottom rule

interface Drop {
  x: number;
  hitY: number; // where it meets the surface; lower is nearer, so its rings are larger and rounder
  t0: number;
}
interface Splash {
  x: number;
  y: number;
  t0: number;
  near: number; // 0 far … 1 near
}

const G = 520; // px/s², so a drop takes ~0.4s to fall
const RINGS = [
  { delay: 0, amp: 1 },
  { delay: 0.13, amp: 0.62 },
  { delay: 0.28, amp: 0.38 },
];

export function Pond() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let drops: Drop[] = [];
    let splashes: Splash[] = [];
    let frame = 0;
    let lastX = -1;
    let queue = 0;
    let nextAt = 0;
    let colors = { crest: "#fff", trough: "#000", drop: "#000" };
    let w = 0;
    let h = 0;

    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const readColors = () => {
      const cs = getComputedStyle(el);
      colors = {
        crest: cs.getPropertyValue("--water-crest").trim() || "#fff",
        trough: cs.getPropertyValue("--water-trough").trim() || "#678",
        drop: cs.getPropertyValue("--water-drop").trim() || "#567",
      };
    };

    // A new drop lands away from the last one, somewhere across the middle of the surface.
    const release = (now: number) => {
      let x = 0;
      for (let i = 0; i < 6; i++) {
        x = w * (0.18 + Math.random() * 0.64);
        if (lastX < 0 || Math.abs(x - lastX) > 34) break;
      }
      lastX = x;
      const hitY = HORIZON + (h - HORIZON) * (0.38 + Math.random() * 0.3);
      if (reduce.matches) splashes.push({ x, y: hitY, t0: now, near: (hitY - HORIZON) / (h - HORIZON) });
      else drops.push({ x, hitY, t0: now });
    };

    const draw = (nowMs: number) => {
      const now = nowMs / 1000;
      while (queue > 0 && now >= nextAt) {
        release(now);
        queue--;
        nextAt = now + 0.16; // several captures at once fall one after another
      }
      ctx.clearRect(0, 0, w, h);

      // Falling drops: a bead that stretches into a tear as it speeds up.
      drops = drops.filter((d) => {
        const t = now - d.t0;
        const y = -4 + 0.5 * G * t * t;
        if (y >= d.hitY) {
          splashes.push({ x: d.x, y: d.hitY, t0: d.t0 + Math.sqrt((2 * (d.hitY + 4)) / G), near: (d.hitY - HORIZON) / (h - HORIZON) });
          return false;
        }
        const len = 2.5 + G * t * 0.011;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = colors.drop;
        ctx.beginPath();
        ctx.moveTo(d.x, y - len - 1.8);
        ctx.quadraticCurveTo(d.x + 2.1, y - 1, d.x + 1.9, y);
        ctx.arc(d.x, y, 1.9, 0, Math.PI);
        ctx.quadraticCurveTo(d.x - 2.1, y - 1, d.x, y - len - 1.8);
        ctx.fill();
        return true;
      });

      // Rings: a bright crest over a dark trough, flattened by the viewing angle, expanding and dying out.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, HORIZON + 0.5, w, h);
      ctx.clip();
      ctx.lineWidth = 1;
      splashes = splashes.filter((s) => {
        const t = now - s.t0;
        if (t < 0) return true;
        const flat = 0.2 + 0.16 * s.near;
        const reach = 54 + 46 * s.near;
        let alive = false;
        const rings = reduce.matches ? [{ delay: 0, amp: 0.8 }] : RINGS;
        for (const ring of rings) {
          const a = t - ring.delay;
          if (a < 0) {
            alive = true;
            continue;
          }
          const r = reduce.matches ? reach * 0.32 : 1.5 + reach * (1 - Math.exp(-a / 1.3));
          const alpha = ring.amp * Math.exp(-a / (reduce.matches ? 0.7 : 1.05)) * (1 / (1 + r / 70));
          if (alpha < 0.02) continue;
          alive = true;
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = colors.crest;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, r, r * flat, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = alpha * 0.55;
          ctx.strokeStyle = colors.trough;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y + 1.1, r * 0.97, r * flat * 0.97, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        return alive;
      });
      ctx.restore();

      // The small rebound droplet the impact throws up, drawn over the rings.
      if (!reduce.matches) {
        for (const s of splashes) {
          const t = now - s.t0;
          const v0 = 62 + 20 * s.near;
          const y = s.y - (v0 * t - 0.5 * G * t * t);
          if (t > 0 && y <= s.y) {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = colors.drop;
            ctx.beginPath();
            ctx.arc(s.x, y, 1.1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;

      if (drops.length || splashes.length || queue > 0) frame = requestAnimationFrame(draw);
      else {
        ctx.clearRect(0, 0, w, h); // smooth water again; nothing runs until the next drop
        frame = 0;
      }
    };

    const onLanded = (e: Event) => {
      const n = Math.max(1, Math.min(5, Number((e as CustomEvent<number>).detail) || 1));
      if (!frame) {
        size();
        readColors();
      }
      queue += n;
      if (!frame) {
        nextAt = 0;
        frame = requestAnimationFrame(draw);
      }
    };
    window.addEventListener("gtd:landed", onLanded);
    return () => {
      window.removeEventListener("gtd:landed", onLanded);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="pond" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
