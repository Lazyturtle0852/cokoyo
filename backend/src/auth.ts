import * as oidc from "openid-client";
import { randomBytes } from "node:crypto";
import { config } from "./config.js";

export interface GoogleIdentity { sub: string; email: string; avatar?: string }
export interface GoogleProvider {
  authorizationUrl(verifier: string, state: string, nonce: string): Promise<URL>;
  exchange(callbackUrl: URL, verifier: string, state: string, nonce: string): Promise<GoogleIdentity>;
}

export const newSecret = () => randomBytes(32).toString("base64url");

/** Google 管理下の画像ホストだけをサーバーから取得し、保存済み写真と同じ data URL にする。 */
export async function downloadGoogleAvatar(picture: string | undefined, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (!picture) return null;
  let url: URL;
  try { url = new URL(picture); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password ||
      !/^lh\d+\.googleusercontent\.com$/.test(url.hostname)) return null;
  try {
    const response = await fetcher(url, {
      headers: { accept: "image/jpeg, image/png, image/webp" },
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!response.ok || !type || !["image/jpeg", "image/png", "image/webp"].includes(type) || !response.body) return null;
    // base64 化後も API の 120KB 制限内に収める。
    const limit = 88 * 1024;
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > limit) return null;
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      chunks.push(Buffer.from(value));
    }
    return size ? `data:${type};base64,${Buffer.concat(chunks).toString("base64")}` : null;
  } catch { return null; }
}

export function validateGoogleIdentity(claims: Record<string, unknown> | undefined): GoogleIdentity {
  if (!claims || typeof claims.sub !== "string" || !claims.sub ||
      claims.hd !== "keio.jp" || claims.email_verified !== true ||
      typeof claims.email !== "string" || !/^[^@\s]+@keio\.jp$/i.test(claims.email)) {
    throw new Error("google_domain_rejected");
  }
  return { sub: claims.sub, email: claims.email.toLowerCase() };
}

export function createGoogleProvider(): GoogleProvider {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !process.env.APP_ORIGIN) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_ORIGIN are required");
  }
  const redirectUri = `${config.appOrigin}/api/v1/auth/google/callback`;
  let configuration: ReturnType<typeof oidc.discovery> | undefined;
  const getConfiguration = () => {
    if (!configuration) configuration = oidc.discovery(new URL("https://accounts.google.com"), clientId, clientSecret)
      .catch((error: unknown) => { configuration = undefined; throw error; });
    return configuration;
  };
  return {
    async authorizationUrl(verifier, state, nonce) {
      const client = await getConfiguration();
      return oidc.buildAuthorizationUrl(client, {
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid profile email",
        state,
        nonce,
        hd: "keio.jp",
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
      });
    },
    async exchange(callbackUrl, verifier, state, nonce) {
      const client = await getConfiguration();
      const tokens = await oidc.authorizationCodeGrant(client, callbackUrl, {
        pkceCodeVerifier: verifier,
        expectedState: state,
        expectedNonce: nonce,
      });
      const claims = tokens.claims() as Record<string, unknown> | undefined;
      const identity = validateGoogleIdentity(claims);
      let picture = typeof claims?.picture === "string" ? claims.picture : undefined;
      if (!picture && tokens.access_token) {
        try {
          const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { authorization: `Bearer ${tokens.access_token}`, accept: "application/json" },
            signal: AbortSignal.timeout(3000),
          });
          if (response.ok) {
            const info = await response.json() as Record<string, unknown>;
            if (info.sub === identity.sub && typeof info.picture === "string") picture = info.picture;
          }
        } catch { /* 写真が取れなくてもログインは続ける */ }
      }
      const avatar = await downloadGoogleAvatar(picture);
      return avatar ? { ...identity, avatar } : identity;
    },
  };
}
