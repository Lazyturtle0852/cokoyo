import { Hono } from "hono";
import type { DtcClient } from "./dtc.js";
import { ApiFailure, errorResponse } from "./lib/errors.js";
import type { Repo } from "./repo.js";
import { createRoutes } from "./routes.js";

/**
 * CORS は設定しない。本番はフロントと同一オリジン（Caddy が /api だけ後ろに流す）、
 * 開発は Vite の dev proxy を通すので、ブラウザから見て常に同一オリジンになる。
 */
export function createApp(repo: Repo, dtc: DtcClient) {
  const app = new Hono();

  // フロントは apiBaseUrl("/api") + "/v1/..." で叩く。
  app.route("/api", createRoutes(repo, dtc));

  app.notFound((c) => errorResponse(c, 404, "not_found", "見つかりません"));

  app.onError((err, c) => {
    if (err instanceof ApiFailure) return errorResponse(c, err.status, err.code, err.message);
    // MACを含みうるので詳細はログに出さない。
    console.error("unhandled error:", err instanceof Error ? err.name : "unknown");
    return errorResponse(c, 500, "server_error", "サーバー側で問題が起きました");
  });

  return app;
}
