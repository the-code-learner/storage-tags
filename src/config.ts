import path from "node:path";

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? path.resolve("data", "inventory.sqlite"),
  nodeEnv: process.env.NODE_ENV ?? "development"
};
