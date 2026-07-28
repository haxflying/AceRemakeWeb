import { describe, expect, it } from "vitest";
import { buildAuthNotice, buildAuthViewModel } from "./auth-ui.js";

describe("buildAuthViewModel", () => {
  it("shows guest actions when unauthenticated", () => {
    expect(buildAuthViewModel({ authenticated: false })).toEqual({
      loginLabel: "登录 / 注册",
      authAction: "login"
    });
  });

  it("shows account actions when authenticated", () => {
    expect(buildAuthViewModel({
      authenticated: true,
      user: { accountName: "pilot001" }
    })).toEqual({
      loginLabel: "退出登录",
      authAction: "logout"
    });
  });
});

describe("buildAuthNotice", () => {
  it("creates visible toast payloads for non-empty messages", () => {
    expect(buildAuthNotice("登录成功。", "success")).toEqual({
      message: "登录成功。",
      type: "success",
      visible: true,
      timeoutMs: 4200
    });
  });

  it("clears toast payloads for empty messages", () => {
    expect(buildAuthNotice("", "error")).toEqual({
      message: "",
      type: "error",
      visible: false,
      timeoutMs: 0
    });
  });
});
