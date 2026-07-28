import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOleDbConnectionString, getGameDbConfig } from "./game-db-config.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bridgeScriptPath = path.resolve(__dirname, "../scripts/legacy-game-account.ps1");

function trimOutput(output) {
  return output.trim();
}

function parseBridgeOutput(stdout) {
  const normalized = trimOutput(stdout);
  if (!normalized) {
    return null;
  }

  return JSON.parse(normalized);
}

export class LegacyGameDbBridge {
  constructor({
    connectionString = createOleDbConnectionString(getGameDbConfig()),
    powershellPath = "powershell.exe",
    scriptPath = bridgeScriptPath
  } = {}) {
    this.connectionString = connectionString;
    this.powershellPath = powershellPath;
    this.scriptPath = scriptPath;
  }

  async run(mode, extraArgs = {}) {
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      this.scriptPath,
      "-Mode",
      mode,
      "-ConnectionString",
      this.connectionString
    ];

    for (const [name, value] of Object.entries(extraArgs)) {
      if (value === undefined || value === null) {
        continue;
      }

      args.push(`-${name}`, String(value));
    }

    const { stdout, stderr } = await execFileAsync(this.powershellPath, args, {
      windowsHide: true
    });

    if (stderr && trimOutput(stderr)) {
      throw new Error(trimOutput(stderr));
    }

    return parseBridgeOutput(stdout);
  }

  async getAccountByName(accountName) {
    return this.run("get-by-name", { AccountName: accountName });
  }

  async getAccountById(accountId) {
    return this.run("get-by-id", { AccountId: accountId });
  }

  async insertAccount({ accountName, password, accountType }) {
    return this.run("insert-account", {
      AccountName: accountName,
      Password: password,
      AccountType: accountType
    });
  }

  async updatePassword({ accountName, password }) {
    return this.run("update-password", {
      AccountName: accountName,
      Password: password
    });
  }
}
