import { Global, Module } from "@nestjs/common";
import { Client } from "minio";
import { MINIO_BUCKET, MINIO_CLIENT } from "./minio.tokens";

// Single shared MinIO client per process. Marked @Global so any feature module
// can inject the client without re-importing this module.
@Global()
@Module({
  providers: [
    {
      provide: MINIO_CLIENT,
      useFactory: () => {
        const endPoint = process.env.MINIO_ENDPOINT;
        const accessKey = process.env.MINIO_ACCESS_KEY;
        const secretKey = process.env.MINIO_SECRET_KEY;
        if (!endPoint || !accessKey || !secretKey) {
          throw new Error(
            "MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY are required",
          );
        }
        return new Client({
          endPoint,
          port: process.env.MINIO_PORT
            ? Number(process.env.MINIO_PORT)
            : undefined,
          useSSL: process.env.MINIO_USE_SSL === "true",
          accessKey,
          secretKey,
        });
      },
    },
    {
      provide: MINIO_BUCKET,
      useFactory: () => {
        const bucket = process.env.MINIO_BUCKET;
        if (!bucket) throw new Error("MINIO_BUCKET is required");
        return bucket;
      },
    },
  ],
  exports: [MINIO_CLIENT, MINIO_BUCKET],
})
export class MinioModule {}
