import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

class InMemoryGameAccountStore {
  constructor() {
    this.nextAccountId = 1;
    this.accounts = new Map();
    this.accountsById = new Map();
  }

  async registerRequest({ accountName, password }) {
    const normalizedAccountName = accountName.trim().toLowerCase();
    if (this.accounts.has(normalizedAccountName)) {
      return {
        ok: false,
        code: "AUTH_ACCOUNT_EXISTS",
        message: "Account already exists."
      };
    }

    const account = {
      accountId: this.nextAccountId++,
      accountName: normalizedAccountName,
      password,
      status: "active"
    };

    this.accounts.set(normalizedAccountName, account);
    this.accountsById.set(account.accountId, account);

    return {
      ok: true,
      user: this.toPublicUser(account)
    };
  }

  async activate() {
    return { ok: true };
  }

  async authenticate({ accountName, password }) {
    const normalizedAccountName = accountName.trim().toLowerCase();
    const account = this.accounts.get(normalizedAccountName);

    if (!account || account.password !== password) {
      return {
        ok: false,
        code: "AUTH_INVALID_CREDENTIALS",
        message: "Login failed."
      };
    }

    return {
      ok: true,
      user: this.toPublicUser(account)
    };
  }

  async createResetToken() {
    return {
      ok: false,
      code: "AUTH_NOT_SUPPORTED",
      message: "Password reset is not available."
    };
  }

  async resetPassword() {
    return {
      ok: false,
      code: "AUTH_NOT_SUPPORTED",
      message: "Password reset is not available."
    };
  }

  async getPublicUserById(accountId) {
    const account = this.accountsById.get(accountId);
    return account ? this.toPublicUser(account) : null;
  }

  toPublicUser(account) {
    return {
      accountId: account.accountId,
      accountName: account.accountName,
      status: account.status
    };
  }
}

describe("auth api", () => {
  it("registers, logs in immediately, reads session, and logs out", async () => {
    const app = createApp({ accountStore: new InMemoryGameAccountStore() });

    const registerResponse = await request(app)
      .post("/auth/register-request")
      .send({
        accountName: "pilot001",
        password: "Secret123!",
        email: "pilot@example.com",
        agreeToTerms: true
      });

    expect(registerResponse.status).toBe(200);
    expect(registerResponse.body.ok).toBe(true);
    expect(registerResponse.body.message).toContain("Account created");

    const loginResponse = await request(app)
      .post("/auth/login")
      .send({
        accountName: "pilot001",
        password: "Secret123!"
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.ok).toBe(true);
    expect(loginResponse.headers["set-cookie"]).toBeTruthy();

    const cookie = loginResponse.headers["set-cookie"][0].split(";")[0];

    const meResponse = await request(app)
      .get("/auth/me")
      .set("Cookie", cookie);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.authenticated).toBe(true);
    expect(meResponse.body.user.accountName).toBe("pilot001");

    const logoutResponse = await request(app)
      .post("/auth/logout")
      .set("Cookie", cookie);

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body.ok).toBe(true);

    const meAfterLogout = await request(app)
      .get("/auth/me")
      .set("Cookie", cookie);

    expect(meAfterLogout.status).toBe(200);
    expect(meAfterLogout.body.authenticated).toBe(false);
  });

  it("rejects duplicate account registration", async () => {
    const app = createApp({ accountStore: new InMemoryGameAccountStore() });

    await request(app)
      .post("/auth/register-request")
      .send({
        accountName: "pilot002",
        password: "Secret123!",
        email: "pilot002@example.com",
        agreeToTerms: true
      });

    const duplicateResponse = await request(app)
      .post("/auth/register-request")
      .send({
        accountName: "pilot002",
        password: "Secret123!",
        email: "pilot002@example.com",
        agreeToTerms: true
      });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.ok).toBe(false);
    expect(duplicateResponse.body.error.code).toBe("AUTH_ACCOUNT_EXISTS");
  });
});
