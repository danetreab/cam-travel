import Redis from "ioredis";

const url = process.env.REDIS_URL;
if (!url) {
  throw new Error("REDIS_URL is required");
}

export const redis = new Redis(url, {
  // Lazy-connect so app boot doesn't block if Redis is briefly unavailable.
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  // commandTimeout caps individual commands. Without it, an unstable
  // connection leaves better-auth's session lookups hanging forever, which
  // makes login requests stay "pending" in the browser.
  connectTimeout: 5000,
  commandTimeout: 3000,
  enableReadyCheck: true,
});

redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});
