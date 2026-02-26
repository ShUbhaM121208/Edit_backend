import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import songRoutes from "./routes/song.routes.js";
import { ensureStorageBuckets } from "./config/supabase.js";

export function createApp() {
  const app = express();

  // ──────────────────────────────────────
  // Global Middleware
  // ──────────────────────────────────────

  app.use(helmet());

  // Support multiple origins via comma-separated FRONTEND_URL
  const allowedOrigins = env.FRONTEND_URL.split(",").map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (curl, mobile apps, etc.)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin ${origin} not allowed`));
        }
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());

  // ──────────────────────────────────────
  // Health Check
  // ──────────────────────────────────────

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ──────────────────────────────────────
  // Routes
  // ──────────────────────────────────────

  app.use("/api/auth", authRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/songs", songRoutes);

  // ──────────────────────────────────────
  // Error Handler (must be last)
  // ──────────────────────────────────────

  app.use(errorHandler);

  return app;
}

// ──────────────────────────────────────
// Start Server (only when run directly)
// ──────────────────────────────────────

const app = createApp();

app.listen(env.PORT, async () => {
  console.log(`\n🚀 ReelMix API running on http://localhost:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Frontend:    ${env.FRONTEND_URL}\n`);

  // Initialize storage buckets
  await ensureStorageBuckets();
});

export default app;
