import { createHash, randomBytes } from "node:crypto";

/**
 * key は MAC から導出しない。
 * 導出するとMACの空間が狭いぶん総当たりで逆算できるため、無関係な128bit乱数にする。
 */
function random128(): string {
  return randomBytes(16).toString("hex");
}

export function newShareKey(): string {
  return `k_${random128()}`;
}

export function newSecret(): string {
  return `s_${random128()}`;
}

/**
 * secret は平文で保存しない。
 * 128bitの乱数なので総当たり耐性は値自体が持っており、ストレッチングは不要。
 * ハッシュで引くことで、比較のタイミング差も原理的に発生しない。
 */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
