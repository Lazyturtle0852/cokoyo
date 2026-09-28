import { createHash, randomBytes } from "node:crypto";

/**
 * 外向けのIDは、MACなどから導出せずランダムに作る。
 * MACの空間は狭いので、ハッシュにすると総当たりで元に戻せてしまう。
 */
function rand(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export const newUserId = () => `u_${rand(8)}`;
export const newShareKey = () => `sk_${rand(8)}`;
export const newRequestId = () => `fr_${rand(8)}`;
/** 端末トークンだけは長くする。これが漏れると本人になれる。 */
export const newDeviceToken = () => `dt_${rand(16)}`;

/** 端末トークンは平文で保存しない。128bit乱数なのでストレッチングは不要。 */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
