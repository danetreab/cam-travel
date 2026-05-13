// String DI token kept in its own file so providers and consumers don't form
// a circular import.
export const REDIS_CLIENT = "REDIS_CLIENT" as const;
