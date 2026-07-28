import { createHash } from "node:crypto";
import { LegacyGameDbBridge } from "./legacy-game-db-bridge.js";

function md5Hex(value) {
  return createHash("md5").update(value).digest("hex");
}

function normalizeAccountName(accountName) {
  return accountName.trim().toLowerCase();
}

function getStoredPassword(account) {
  return account.Password ?? account.password ?? "";
}

export class GameAccountStore {
  constructor({
    bridge = new LegacyGameDbBridge(),
    passwordAdditionalString = process.env.ACE_AUTH_PASSWORD_ADDITIONAL_STRING || "",
    passwordStorageMode = process.env.ACE_AUTH_PASSWORD_STORAGE_MODE || "plain",
    accountType = Number(process.env.ACE_AUTH_GAME_ACCOUNT_TYPE || 0)
  } = {}) {
    this.bridge = bridge;
    this.passwordAdditionalString = passwordAdditionalString;
    this.passwordStorageMode = passwordStorageMode;
    this.accountType = accountType;
  }

  async registerRequest({ accountName, password }) {
    const normalizedAccountName = normalizeAccountName(accountName);
    const existingAccount = await this.bridge.getAccountByName(normalizedAccountName);

    if (existingAccount) {
      return {
        ok: false,
        code: "AUTH_ACCOUNT_EXISTS",
        message: "Account already exists."
      };
    }

    const storedPassword = this.prepareStoredPassword(password);
    const createdAccount = await this.bridge.insertAccount({
      accountName: normalizedAccountName,
      password: storedPassword,
      accountType: this.accountType
    });

    return {
      ok: true,
      user: this.toPublicUser(createdAccount)
    };
  }

  async activate() {
    return { ok: true };
  }

  async authenticate({ accountName, password }) {
    const normalizedAccountName = normalizeAccountName(accountName);
    const account = await this.bridge.getAccountByName(normalizedAccountName);

    if (!account || !this.isCompatiblePassword(getStoredPassword(account), password)) {
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
      message: "Password reset is not available for game accounts."
    };
  }

  async resetPassword() {
    return {
      ok: false,
      code: "AUTH_NOT_SUPPORTED",
      message: "Password reset is not available for game accounts."
    };
  }

  async getPublicUserById(accountId) {
    const account = await this.bridge.getAccountById(accountId);
    return account ? this.toPublicUser(account) : null;
  }

  prepareStoredPassword(password) {
    if (this.passwordStorageMode === "launcher_hash") {
      return this.computeLauncherHash(password);
    }

    return password;
  }

  computeLauncherHash(password) {
    return md5Hex(`${this.passwordAdditionalString}${password}`);
  }

  isCompatiblePassword(storedPassword, plainPassword) {
    if (!storedPassword) {
      return false;
    }

    if (storedPassword === plainPassword) {
      return true;
    }

    const launcherHash = this.computeLauncherHash(plainPassword);
    return storedPassword.toLowerCase() === launcherHash.toLowerCase();
  }

  toPublicUser(account) {
    return {
      accountId: Number(account.AccountUniqueNumber ?? account.accountId),
      accountName: normalizeAccountName(account.AccountName ?? account.accountName),
      status: "active"
    };
  }
}
