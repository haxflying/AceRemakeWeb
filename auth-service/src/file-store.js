import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function hashPassword(password) {
  return createHash("sha256").update(`ace-remake:${password}`).digest("hex");
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function readJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export class FileAccountStore {
  constructor({ dataDir }) {
    this.dataDir = path.resolve(dataDir);
    this.filePath = path.join(this.dataDir, "accounts.json");
  }

  async loadState() {
    await ensureDir(this.dataDir);
    const state = await readJson(this.filePath);
    return state ?? {
      nextAccountId: 1,
      accounts: [],
      activationTokens: [],
      resetTokens: []
    };
  }

  async saveState(state) {
    await ensureDir(this.dataDir);
    await writeFile(this.filePath, JSON.stringify(state, null, 2));
  }

  async registerRequest({ accountName, password, email }) {
    const state = await this.loadState();
    const normalizedAccountName = accountName.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    if (state.accounts.some((account) => account.accountName === normalizedAccountName)) {
      return { ok: true, activationToken: null };
    }

    if (state.accounts.some((account) => account.email === normalizedEmail)) {
      return { ok: true, activationToken: null };
    }

    const account = {
      id: state.nextAccountId++,
      accountName: normalizedAccountName,
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      status: "pending_activation",
      createdAt: new Date().toISOString(),
      activatedAt: null
    };

    const activationToken = randomUUID();
    state.accounts.push(account);
    state.activationTokens.push({
      token: activationToken,
      accountId: account.id,
      expiresAt: Date.now() + (1000 * 60 * 60 * 24),
      usedAt: null
    });

    await this.saveState(state);

    return { ok: true, activationToken };
  }

  async activate(token) {
    const state = await this.loadState();
    const activation = state.activationTokens.find((item) => item.token === token);

    if (!activation || activation.usedAt || activation.expiresAt < Date.now()) {
      return { ok: false, code: "AUTH_TOKEN_INVALID" };
    }

    const account = state.accounts.find((item) => item.id === activation.accountId);
    if (!account) {
      return { ok: false, code: "AUTH_TOKEN_INVALID" };
    }

    account.status = "active";
    account.activatedAt = new Date().toISOString();
    activation.usedAt = Date.now();

    await this.saveState(state);

    return { ok: true };
  }

  async authenticate({ accountName, password }) {
    const state = await this.loadState();
    const normalizedAccountName = accountName.trim().toLowerCase();
    const account = state.accounts.find((item) => item.accountName === normalizedAccountName);

    if (!account || account.passwordHash !== hashPassword(password)) {
      return { ok: false, code: "AUTH_INVALID_CREDENTIALS" };
    }

    if (account.status !== "active") {
      return { ok: false, code: "AUTH_ACCOUNT_NOT_ACTIVATED" };
    }

    return { ok: true, user: this.toPublicUser(account) };
  }

  async createResetToken({ accountOrEmail }) {
    const state = await this.loadState();
    const lookup = accountOrEmail.trim().toLowerCase();
    const account = state.accounts.find((item) => item.accountName === lookup || item.email === lookup);

    if (!account || account.status !== "active") {
      return { ok: true, resetToken: null };
    }

    const resetToken = randomUUID();
    state.resetTokens.push({
      token: resetToken,
      accountId: account.id,
      expiresAt: Date.now() + (1000 * 60 * 30),
      usedAt: null
    });

    await this.saveState(state);

    return { ok: true, resetToken };
  }

  async resetPassword({ token, newPassword }) {
    const state = await this.loadState();
    const resetToken = state.resetTokens.find((item) => item.token === token);

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < Date.now()) {
      return { ok: false, code: "AUTH_TOKEN_INVALID" };
    }

    const account = state.accounts.find((item) => item.id === resetToken.accountId);
    if (!account) {
      return { ok: false, code: "AUTH_TOKEN_INVALID" };
    }

    account.passwordHash = hashPassword(newPassword);
    resetToken.usedAt = Date.now();

    await this.saveState(state);

    return { ok: true };
  }

  async getPublicUserById(accountId) {
    const state = await this.loadState();
    const account = state.accounts.find((item) => item.id === accountId);
    return account ? this.toPublicUser(account) : null;
  }

  toPublicUser(account) {
    const emailName = account.email.split("@")[0];
    const maskedName = emailName.length > 2 ? `${emailName.slice(0, 2)}***` : `${emailName[0] ?? "*"}***`;
    const emailDomain = account.email.split("@")[1] ?? "";

    return {
      accountId: account.id,
      accountName: account.accountName,
      emailMasked: `${maskedName}@${emailDomain}`,
      status: account.status
    };
  }
}
