import { createApp } from "./app.js";

const port = Number(process.env.PORT || 3001);
const app = createApp({
  backend: process.env.ACE_AUTH_BACKEND || "game",
  dataDir: process.env.ACE_AUTH_DATA_DIR || "auth-service/data",
  secureCookies: process.env.NODE_ENV === "production"
});

app.listen(port, () => {
  console.log(`ACE auth service listening on http://localhost:${port}`);
});
