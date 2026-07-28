import request from "supertest";
import { describe, expect, it } from "vitest";
import { createStaticSiteApp } from "./static-site-app.js";

describe("static site encoding", () => {
  it("serves the homepage as utf-8 html", async () => {
    const app = createStaticSiteApp();

    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["content-type"]).toContain("charset=utf-8");
    expect(response.text).toContain("ACE REMAKE 官方网站");
    expect(response.text).toContain("登录 / 注册");
  });

  it("serves auth ui script as utf-8 javascript", async () => {
    const app = createStaticSiteApp();

    const response = await request(app).get("/auth-ui.js");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("javascript");
    expect(response.headers["content-type"]).toContain("charset=utf-8");
    expect(response.text).toContain('loginLabel: "登录 / 注册"');
  });
});
