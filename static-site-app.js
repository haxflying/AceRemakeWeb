import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function setUtf8ContentType(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".html") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    return;
  }

  if (extension === ".js") {
    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    return;
  }

  if (extension === ".css") {
    response.setHeader("Content-Type", "text/css; charset=utf-8");
  }
}

export function createStaticSiteApp(rootDir = __dirname) {
  const app = express();

  app.use((request, response, next) => {
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    next();
  });

  app.get("/", (_request, response) => {
    const filePath = path.join(rootDir, "index.html");
    setUtf8ContentType(response, filePath);
    response.sendFile(filePath);
  });

  app.use(express.static(rootDir, {
    extensions: ["html"],
    setHeaders: (response, filePath) => {
      setUtf8ContentType(response, filePath);
    }
  }));

  return app;
}
