import dotenv from "dotenv";
dotenv.config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
  PORT: parseInt(process.env.PORT || "3001", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173,http://localhost:8080",
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
} as const;

// Validate required env vars at startup
const required = ["DATABASE_URL", "JWT_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
for (const key of required) {
  if (!env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
