import cookieParser from "cookie-parser";
import express from "express";
import { FileAccountStore } from "./file-store.js";
import { GameAccountStore } from "./game-account-store.js";
import { SessionStore } from "./session-store.js";

function sendError(response, status, code, message) {
  response.status(status).json({
    ok: false,
    error: {
      code,
      message
    }
  });
}

function validateRegistration(body) {
  if (!body?.accountName || !body?.password || !body?.email || !body?.agreeToTerms) {
    return "AUTH_VALIDATION_FAILED";
  }

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(body.accountName)) {
    return "AUTH_VALIDATION_FAILED";
  }

  if (body.password.length < 8 || body.password.length > 14 || !body.email.includes("@")) {
    return "AUTH_VALIDATION_FAILED";
  }

  return null;
}

function validateLogin(body) {
  if (!body?.accountName || !body?.password) {
    return "AUTH_VALIDATION_FAILED";
  }

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(body.accountName)) {
    return "AUTH_VALIDATION_FAILED";
  }

  if (body.password.length > 14) {
    return "AUTH_VALIDATION_FAILED";
  }

  return null;
}

function createDefaultAccountStore({ accountStore, backend, dataDir }) {
  if (accountStore) {
    return accountStore;
  }

  if (backend === "file") {
    return new FileAccountStore({ dataDir });
  }

  return new GameAccountStore();
}

function sendStoreError(response, result, fallbackMessage, statusMap = {}) {
  const status = statusMap[result.code] ?? 400;
  return sendError(response, status, result.code, result.message || fallbackMessage);
}

function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch((error) => {
      if (response.headersSent) {
        return next(error);
      }

      return sendError(
        response,
        503,
        "AUTH_BACKEND_UNAVAILABLE",
        error.message || "Authentication backend is unavailable."
      );
    });
  };
}

export function createApp({
  dataDir = "auth-service/data",
  backend = process.env.ACE_AUTH_BACKEND || "game",
  accountStore = null,
  exposeTestTokens = false,
  secureCookies = false,
  allowedOrigins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173"
  ]
} = {}) {
  const app = express();
  const resolvedAccountStore = createDefaultAccountStore({ accountStore, backend, dataDir });
  const sessionStore = new SessionStore();

  app.use((request, _response, next) => {
    console.log(`[auth-service] ${request.method} ${request.path}`);
    next();
  });

  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      response.header("Access-Control-Allow-Origin", origin);
      response.header("Access-Control-Allow-Credentials", "true");
      response.header("Access-Control-Allow-Headers", "Content-Type");
      response.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    }

    if (request.method === "OPTIONS") {
      return response.sendStatus(204);
    }

    return next();
  });

  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/auth/register-request", asyncHandler(async (request, response) => {
    const validationCode = validateRegistration(request.body);
    if (validationCode) {
      return sendError(response, 400, validationCode, "Invalid registration payload.");
    }

    const result = await resolvedAccountStore.registerRequest(request.body);
    if (!result.ok) {
      return sendStoreError(response, result, "Registration failed.", {
        AUTH_ACCOUNT_EXISTS: 409
      });
    }

    const payload = {
      ok: true,
      message: backend === "file"
        ? "If the request is valid, an activation email has been sent."
        : "Account created successfully. You can log in now."
    };

    if (exposeTestTokens && result.activationToken) {
      payload.activationToken = result.activationToken;
    }

    return response.json(payload);
  }));

  app.post("/auth/activate", asyncHandler(async (request, response) => {
    const result = await resolvedAccountStore.activate(request.body?.token);
    if (!result.ok) {
      return sendError(response, 400, result.code, "Activation link is invalid or expired.");
    }

    return response.json({ ok: true });
  }));

  app.post("/auth/login", asyncHandler(async (request, response) => {
    const validationCode = validateLogin(request.body);
    if (validationCode) {
      return sendError(response, 400, validationCode, "Invalid login payload.");
    }

    const result = await resolvedAccountStore.authenticate(request.body ?? {});
    if (!result.ok) {
      const status = result.code === "AUTH_ACCOUNT_NOT_ACTIVATED" ? 403 : 401;
      return sendError(response, status, result.code, result.message || "Login failed.");
    }

    const sessionId = sessionStore.create(result.user.accountId);
    response.cookie("sid", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      path: "/"
    });

    return response.json({
      ok: true,
      user: result.user
    });
  }));

  app.get("/auth/me", asyncHandler(async (request, response) => {
    const sessionId = request.cookies.sid;
    if (!sessionId) {
      return response.json({ authenticated: false });
    }

    const session = sessionStore.get(sessionId);
    if (!session) {
      return response.json({ authenticated: false });
    }

    const user = await resolvedAccountStore.getPublicUserById(session.accountId);
    if (!user) {
      sessionStore.delete(sessionId);
      return response.json({ authenticated: false });
    }

    return response.json({
      authenticated: true,
      user
    });
  }));

  app.post("/auth/logout", (request, response) => {
    const sessionId = request.cookies.sid;
    if (sessionId) {
      sessionStore.delete(sessionId);
    }

    response.clearCookie("sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      path: "/"
    });

    return response.json({ ok: true });
  });

  app.post("/auth/forgot-password", asyncHandler(async (request, response) => {
    const result = await resolvedAccountStore.createResetToken(request.body ?? {});
    if (!result.ok) {
      return sendStoreError(response, result, "Password reset is not available.", {
        AUTH_NOT_SUPPORTED: 501
      });
    }

    const payload = {
      ok: true,
      message: "If the account exists, a reset email has been sent."
    };

    if (exposeTestTokens && result.resetToken) {
      payload.resetToken = result.resetToken;
    }

    return response.json(payload);
  }));

  app.post("/auth/reset-password", asyncHandler(async (request, response) => {
    if (!request.body?.token || !request.body?.newPassword || request.body.newPassword.length < 8) {
      return sendError(response, 400, "AUTH_VALIDATION_FAILED", "Invalid password reset payload.");
    }

    const result = await resolvedAccountStore.resetPassword(request.body);
    if (!result.ok) {
      return sendStoreError(response, result, "Reset link is invalid or expired.", {
        AUTH_NOT_SUPPORTED: 501
      });
    }

    return response.json({ ok: true });
  }));

  return app;
}
