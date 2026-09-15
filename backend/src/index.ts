import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { openDb } from "./db.js";
import { createDtcClient } from "./dtc.js";
import { createRepo } from "./repo.js";

const app = createApp(createRepo(openDb(config.dbPath)), createDtcClient());

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`cokoyo-backend listening on :${info.port} (mock_dtc=${config.mockDtc})`);
});
