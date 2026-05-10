// String DI tokens — kept in their own file so circular import risk between
// the provider, service, and module is zero.
export const MINIO_CLIENT = "MINIO_CLIENT" as const;
export const MINIO_BUCKET = "MINIO_BUCKET" as const;
