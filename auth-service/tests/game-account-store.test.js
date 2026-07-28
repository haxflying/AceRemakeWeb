import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GameAccountStore } from "../src/game-account-store.js";

class FakeLegacyDbBridge {
  constructor() {
    this.accounts = new Map();
    this.nextAccountId = 1;
  }

  async getAccountByName(accountName) {
    return this.accounts.get(accountName) ?? null;
  }

  async getAccountById(accountId) {
    for (const account of this.accounts.values()) {
      if (account.accountId === accountId) {
        return account;
      }
    }

    return null;
  }

  async insertAccount({ accountName, password, accountType }) {
    const account = {
      accountId: this.nextAccountId++,
      accountName,
      password,
      accountType
    };

    this.accounts.set(accountName, account);
    return account;
  }

  async updatePassword({ accountName, password }) {
    const account = this.accounts.get(accountName);
    if (!account) {
      return null;
    }

    account.password = password;
    return account;
  }
}

describe("GameAccountStore", () => {
  it("creates a lowercased active account in the legacy game database", async () => {
    const store = new GameAccountStore({
      bridge: new FakeLegacyDbBridge(),
      passwordStorageMode: "plain"
    });

    const response = await store.registerRequest({
      accountName: "Pilot001",
      password: "Secret123!",
      email: "pilot@example.com"
    });

    expect(response.ok).toBe(true);
    expect(response.user.accountName).toBe("pilot001");
    expect(response.user.status).toBe("active");
  });

  it("accepts legacy plain-text passwords for launcher compatibility", async () => {
    const bridge = new FakeLegacyDbBridge();
    await bridge.insertAccount({
      accountName: "pilot002",
      password: "Secret123!",
      accountType: 0
    });

    const store = new GameAccountStore({
      bridge,
      passwordStorageMode: "plain"
    });

    const response = await store.authenticate({
      accountName: "pilot002",
      password: "Secret123!"
    });

    expect(response.ok).toBe(true);
    expect(response.user.accountName).toBe("pilot002");
  });

  it("accepts stored launcher-hash passwords when configured", async () => {
    const bridge = new FakeLegacyDbBridge();
    const passwordAdditionalString = "@@";
    const hashedPassword = createHash("md5")
      .update(`${passwordAdditionalString}Secret123!`)
      .digest("hex");

    await bridge.insertAccount({
      accountName: "pilot003",
      password: hashedPassword,
      accountType: 0
    });

    const store = new GameAccountStore({
      bridge,
      passwordAdditionalString,
      passwordStorageMode: "launcher_hash"
    });

    const response = await store.authenticate({
      accountName: "pilot003",
      password: "Secret123!"
    });

    expect(response.ok).toBe(true);
    expect(response.user.accountName).toBe("pilot003");
  });
});
