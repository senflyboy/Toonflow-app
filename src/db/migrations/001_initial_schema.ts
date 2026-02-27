import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create UUID extension if not exists
  await knex.raw("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"");

  // Create users table
  await knex.schema.createTable("users", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("email").unique();
    table.string("phone").unique();
    table.string("password_hash").notNullable();
    table.string("username").unique();
    table.boolean("email_verified").defaultTo(false);
    table.boolean("phone_verified").defaultTo(false);
    table.integer("failed_login_attempts").defaultTo(0);
    table.timestamp("locked_until");
    table.timestamps(true, true);
  });

  // Create refresh_tokens table
  await knex.schema.createTable("refresh_tokens", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("token_hash").notNullable();
    table.timestamp("expires_at").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // Create sms_codes table
  await knex.schema.createTable("sms_codes", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("phone").notNullable();
    table.string("code").notNullable();
    table.string("purpose").notNullable(); // 'register', 'reset_password'
    table.boolean("used").defaultTo(false);
    table.timestamp("expires_at").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // Create audit_logs table
  await knex.schema.createTable("audit_logs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("user_id").references("id").inTable("users").onDelete("SET NULL");
    table.string("action").notNullable(); // 'login', 'register', 'password_change', etc.
    table.specificType("ip_address", "INET");
    table.string("user_agent");
    table.jsonb("metadata");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // Create indexes
  await knex.schema.raw("CREATE INDEX idx_users_email ON users(email)");
  await knex.schema.raw("CREATE INDEX idx_users_phone ON users(phone)");
  await knex.schema.raw("CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id)");
  await knex.schema.raw("CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id)");
  await knex.schema.raw("CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("audit_logs");
  await knex.schema.dropTableIfExists("sms_codes");
  await knex.schema.dropTableIfExists("refresh_tokens");
  await knex.schema.dropTableIfExists("users");
}