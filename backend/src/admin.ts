import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 管理画面（/admin）と説明画面（/explain）に入るためのパスワード。
 *
 * 利用者の Google ログインとは別物。パスワードは環境変数 ADMIN_PASSWORD の1つだけで、
 * 空なら管理用の入口はすべて閉じる。
 *
 * 入ったしるしの Cookie は「期限.署名」。署名の鍵は起動のたびに作り直すので、
 * DB に何も残さず、再起動すると全員ログインし直しになる（試作なのでそれで足りる）。
 */

const TTL_MS = 12 * 60 * 60 * 1000;
/** 同じ IP から、この時間内にこれだけ間違えたら、しばらく受け付けない。 */
const LOCKOUT = { WINDOW_MS: 15 * 60 * 1000, MAX_FAILURES: 5 } as const;

const digest = (s: string) => createHash("sha256").update(s).digest();

export function createAdminAuth(password: string, now: () => number = Date.now) {
  const key = randomBytes(32);
  const expected = digest(password);
  const failures = new Map<string, number[]>();

  const sign = (exp: number) => createHmac("sha256", key).update(`admin.${exp}`).digest("base64url");

  const recent = (ip: string) => (failures.get(ip) ?? []).filter((t) => now() - t < LOCKOUT.WINDOW_MS);

  return {
    TTL_MS,
    enabled: password.length > 0,

    locked: (ip: string) => recent(ip).length >= LOCKOUT.MAX_FAILURES,

    /** 長さの違いも含めて、比べる時間から中身が分からないようにする。 */
    check(input: string, ip: string): boolean {
      const ok = password.length > 0 && timingSafeEqual(digest(input), expected);
      if (ok) failures.delete(ip);
      else failures.set(ip, [...recent(ip), now()]);
      return ok;
    },

    issue(): string {
      const exp = now() + TTL_MS;
      return `${exp}.${sign(exp)}`;
    },

    verify(token: string | undefined): boolean {
      if (!password || !token) return false;
      const [raw, mac] = token.split(".");
      const exp = Number(raw);
      if (!Number.isSafeInteger(exp) || exp <= now() || !mac) return false;
      const want = Buffer.from(sign(exp));
      const got = Buffer.from(mac);
      return want.length === got.length && timingSafeEqual(want, got);
    },
  };
}

export type AdminAuth = ReturnType<typeof createAdminAuth>;
