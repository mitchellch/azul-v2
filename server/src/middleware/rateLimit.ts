import rateLimit from 'express-rate-limit';

// API rate-limiting — defense-in-depth backstop to the (planned) Cloudflare
// proxy. This layer works even when a request reaches the origin directly
// (e.g. before the Cloudflare origin-lock lands, or from a LAN client), and it
// lets us cap specific endpoints more tightly than Cloudflare's free tier can.
//
// Store: in-memory, which is correct for the single home-server instance. If the
// API ever runs as multiple instances (e.g. Lambda), swap in a shared store
// (Redis) so buckets are consistent across processes.
//
// Depends on `app.set('trust proxy', N)` in index.ts — without it req.ip is the
// Caddy/Cloudflare hop and every client would share one bucket.

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Global cap for all /api traffic. Generous on purpose — this is DoS/abuse
// protection, not fine-grained throttling. Mounted before the JWT middleware so
// it also shields the token-verification path from invalid-token floods.
export const apiLimiter = rateLimit({
  windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000), // 1 minute
  limit:    num(process.env.RATE_LIMIT_MAX, 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — slow down.' },
});

// Tight cap for firmware uploads. The upload route is already M2M-only and
// 8 MB-capped by multer; this guards against a leaked M2M token being used to
// spam the release namespace. Applied to the POST only — the GET
// "update available" listing rides the global limiter.
export const firmwareUploadLimiter = rateLimit({
  windowMs: num(process.env.FIRMWARE_UPLOAD_WINDOW_MS, 60 * 60_000), // 1 hour
  limit:    num(process.env.FIRMWARE_UPLOAD_MAX, 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many firmware uploads — slow down.' },
});
