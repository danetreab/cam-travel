import Redis from "ioredis";

const url = process.env.REDIS_URL;
if (!url) {
  throw new Error("REDIS_URL is required");
}

export const redis = new Redis(url, {
  // Lazy-connect so app boot doesn't block if Redis is briefly unavailable.
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});
