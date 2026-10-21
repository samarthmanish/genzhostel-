import "dotenv/config";
import { z } from "zod";

const defaultBaseUrl = process.env.RENDER_EXTERNAL_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_BASE_URL: z.string().url().default(defaultBaseUrl),
  DATABASE_URL: z.string().min(10, "DATABASE_URL must be a valid postgresql:// connection string"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(8),
  ALLOW_SELF_REGISTRATION: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SEED_DEMO_USERS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  COMPLAINT_REOPEN_WINDOW_HOURS: z.coerce.number().int().min(0).max(24 * 90).default(48),
  CHAT_PROVIDER: z.enum(["local", "openai-compatible"]).default("local"),
  CHAT_PROVIDER_API_KEY: z.string().default(""),
  CHAT_PROVIDER_BASE_URL: z.string().default(""),
  CHAT_PROVIDER_MODEL: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a clear message — never silently run with broken configuration.
  console.error("\n[config] Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nCopy .env.example to .env and fill in the values, then restart.\n");
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === "production";
export const isTest = config.NODE_ENV === "test";
