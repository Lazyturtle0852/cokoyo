import type { Context } from "hono";

/**
 * message はそのまま画面に出るので、ユーザーが読んで分かる日本語にする。
 * code はアプリ側の分岐用。
 */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * アロー関数だと never による絞り込みが効かない（変数に型注釈が要る）ため、
 * 関数宣言で書く。呼んだ先で「この行以降は来ない」と型に伝わる。
 */
export function fail(status: number, code: string, message: string): never {
  throw new ApiFailure(status, code, message);
}

export function errorResponse(c: Context, status: number, code: string, message: string) {
  return c.json({ error: { code, message } }, status as 400);
}
