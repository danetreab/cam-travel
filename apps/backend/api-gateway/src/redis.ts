import Redis from "ioredis";

const url = process.env.REDIS_URL;
if (!url) {
  throw new Error("REDIS_URL is required");
}

// commandTimeout caps every Redis command at 3s. Without it, a stalled
// connection (Coolify deploy, idle keepalive drop, transient network blip)
// leaves commands queued indefinitely, which makes better-auth's getSession
// hang and surfaces as a "pending" /graphql/v1 request that never resolves.
export const redis = new Redis(url, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  connectTimeout: 5000,
  commandTimeout: 3000,
  enableReadyCheck: true,
});

redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});
