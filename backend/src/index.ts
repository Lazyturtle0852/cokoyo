import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { startArrivalWatch } from "./arrival.js";
import { createGoogleProvider } from "./auth.js";
import { config } from "./config.js";
import { openDb } from "./db.js";
import { createDtcClient } from "./dtc.js";
import { createPushSender } from "./push.js";
import { createRepo } from "./repo.js";

const repo = createRepo(openDb(config.dbPath));
const dtc = createDtcClient();
const push = createPushSender(repo);
const app = createApp(repo, dtc, createGoogleProvider(), undefined, push);
if (config.arrivalWatch) startArrivalWatch(repo, dtc, push);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`cokoyo-backend listening on :${info.port} (mock_dtc=${config.mockDtc})`);
  // デプロイ・再起動の時刻。前後に「繋がらなかった」が固まっていれば、それが原因と分かる
  repo.recordOps({ source: "server", kind: "start", message: `mock_dtc=${config.mockDtc}` });
});
