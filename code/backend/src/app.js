import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { checkDbConnection } from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.middleware.js";
import { authMiddleware } from "./middleware/auth.middleware.js";
import { asyncHandler } from "./utils/asyncHandler.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import courseRoutes from "./routes/course.routes.js";
import chapterRoutes from "./routes/chapter.routes.js";
import lessonRoutes from "./routes/lesson.routes.js";
import screenRoutes from "./routes/screen.routes.js";
import questionRoutes from "./routes/question.routes.js";
import practiceSetRoutes from "./routes/practiceSet.routes.js";
import attemptRoutes from "./routes/attempt.routes.js";
import progressRoutes from "./routes/progress.routes.js";
import cohortRoutes from "./routes/cohort.routes.js";
import auditLogRoutes from "./routes/auditLog.routes.js";
import adminRoutes from "./routes/admin.routes.js";

export const app = express();

// 03-security-architecture.md §6.1 -- exactly one trusted origin per environment, never a
// wildcard; credentials required for the httpOnly refresh-token cookie to be sent at all.
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  })
);
app.use(express.json());
app.use(cookieParser());

// 03-security-architecture.md §3.2 -- global JWT verification + public-route whitelist. Runs on
// every request from here on; /health and /auth/{signup,login,refresh} are the whitelisted
// exceptions defined inside auth.middleware.js itself.
app.use(authMiddleware);

// 02-api-contract.md §0.4 -- public, no auth required, reachable by external monitors.
app.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const isConnected = await checkDbConnection();
    if (!isConnected) {
      return res.status(503).json({ status: "unavailable" });
    }
    return res.status(200).json({ status: "ok" });
  })
);

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/courses", courseRoutes);
app.use("/chapters", chapterRoutes);
app.use("/lessons", lessonRoutes);
app.use("/screens", screenRoutes);
app.use("/questions", questionRoutes);
app.use("/practice-sets", practiceSetRoutes);
app.use("/attempts", attemptRoutes);
app.use("/progress", progressRoutes);
app.use("/cohorts", cohortRoutes);
app.use("/audit-log", auditLogRoutes);
app.use("/admin", adminRoutes);

// Further resource routes mount here as each is built -- see 04-application-architecture.md §7
// for the full intended registration order.

app.use(errorHandler); // MUST be registered last (04-application-architecture.md §7)
