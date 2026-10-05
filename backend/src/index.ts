import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createGoogleProvider } from "./auth.js";
import { config } from "./config.js";
import { openDb } from "./db.js";
import { createDtcClient } from "./dtc.js";
import { createRepo } from "./repo.js";

const repo = createRepo(openDb(config.dbPath));
const app = createApp(repo, createDtcClient(), createGoogleProvider());

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`cokoyo-backend listening on :${info.port} (mock_dtc=${config.mockDtc})`);
  // デプロイ・再起動の時刻。前後に「繋がらなかった」が固まっていれば、それが原因と分かる
  repo.recordOps({ source: "server", kind: "start", message: `mock_dtc=${config.mockDtc}` });
});
