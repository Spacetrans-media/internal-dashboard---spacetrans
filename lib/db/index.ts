/** Shared MySQL pool + Drizzle client. One pool per process (Next reuses it in dev). */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: mysql.Pool };

const pool =
  globalForDb.pool ??
  mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 5,

    /**
     * Hostinger's MariaDB closes idle connections after a short wait_timeout.
     * Left alone, the pool keeps handing out sockets the server has already
     * dropped and the first query after a quiet spell dies with ECONNRESET —
     * which in practice means the dashboard is broken every morning, because
     * nobody loads it overnight.
     *
     * So the pool retires its own connections well before the server does, and
     * keeps very few idle at all.
     */
    idleTimeout: 30_000,
    maxIdle: 2,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };
