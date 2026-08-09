import { verifyAccessToken } from "../utils/token.js";
import { refreshTokenService } from "../services/refreshToken.service.js";
import { UnauthenticatedError } from "../errors/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// 03-security-architecture.md §3.2 -- runs on every route by default; public routes are
// explicitly whitelisted exceptions, not individually opted into auth. A forgotten whitelist
// entry produces an obviously broken (locked) route, noticed immediately; a forgotten per-route
// auth call produces a silently public route, which might never be noticed.
//
// `path` supports a `:param` segment (matched as one or more non-slash characters) so a handful
// of read-only, syllabus-level GETs can be whitelisted without exposing every path under the same
// prefix -- Phase 5.5's public course-preview: title/narrative/chapter-and-lesson-titles only.
// Deliberately NOT whitelisted: GET /lessons/:lessonId/screens (the actual lesson content) and
// GET /lessons/:lessonId/practice-sets, and nothing non-GET is ever whitelisted here -- the free
// preview sells the syllabus, never the teaching material itself.
const PUBLIC_ROUTES = [
  { method: "POST", path: "/auth/signup" },
  { method: "POST", path: "/auth/login" },
  { method: "POST", path: "/auth/refresh" },
  { method: "POST", path: "/auth/password-reset/request" },
  { method: "POST", path: "/auth/password-reset/confirm" },
  { method: "GET", path: "/health" },
  { method: "GET", path: "/courses" },
  { method: "GET", path: "/courses/:courseId" },
  { method: "GET", path: "/courses/:courseId/chapters" },
  { method: "GET", path: "/chapters/:chapterId/lessons" },
];

// Compiled once at module load, not per-request -- these never change at runtime.
const COMPILED_PUBLIC_ROUTES = PUBLIC_ROUTES.map(({ method, path }) => ({
  method,
  pattern: new RegExp(`^${path.replace(/:[^/]+/g, "[^/]+")}$`),
}));

function isPublicRoute(req) {
  return COMPILED_PUBLIC_ROUTES.some(
    (route) => route.method === req.method && route.pattern.test(req.path)
  );
}

export const authMiddleware = asyncHandler(async (req, res, next) => {
  if (isPublicRoute(req)) return next();

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthenticatedError();
  }
  const token = header.slice("Bearer ".length);

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new UnauthenticatedError();
  }

  // The session row this token is paired with must still be un-revoked -- this is what lets
  // logout invalidate an access token immediately rather than waiting out its 15-minute natural
  // expiry (03-security-architecture.md §2.4-2.5). Goes through the service, never the
  // repository directly (04-application-architecture.md §1 -- middleware gets no exception).
  const isActive = await refreshTokenService.isSessionActive(Number(payload.jti));
  if (!isActive) {
    throw new UnauthenticatedError();
  }

  req.user = { id: payload.sub, role: payload.role, email: payload.email };
  next();
});
