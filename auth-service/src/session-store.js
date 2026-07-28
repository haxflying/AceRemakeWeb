import { randomUUID } from "node:crypto";

export class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  create(accountId) {
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      accountId,
      createdAt: Date.now()
    });
    return sessionId;
  }

  get(sessionId) {
    return this.sessions.get(sessionId) ?? null;
  }

  delete(sessionId) {
    this.sessions.delete(sessionId);
  }
}
