import { createStaticSiteApp } from "./static-site-app.js";

const port = Number(process.env.PORT || 8080);
const app = createStaticSiteApp();

app.listen(port, () => {
  console.log(`ACE static site listening on http://localhost:${port}`);
});
