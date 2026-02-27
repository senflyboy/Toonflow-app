import knex, { Knex } from "knex";

let pgDb: Knex | null = null;

export function getPgDb(): Knex {
  if (!pgDb) {
    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
      throw new Error("DATABASE_URL or DB_HOST must be configured for PostgreSQL");
    }

    pgDb = knex({
      client: "pg",
      connection: process.env.DATABASE_URL || {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "postgres",
        database: process.env.DB_NAME || "toonflow",
      },
      pool: {
        min: 2,
        max: 10,
      },
    });
  }
  return pgDb;
}

export async function initPgDb(): Promise<Knex> {
  const db = getPgDb();

  // Test connection
  await db.raw("SELECT 1");

  console.log("PostgreSQL database connected successfully");

  return db;
}

export default getPgDb;