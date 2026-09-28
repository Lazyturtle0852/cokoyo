import * as oidc from "openid-client";
import { randomBytes } from "node:crypto";
import { config } from "./config.js";

export interface GoogleIdentity { sub: string; email: string }
export interface GoogleProvider {
  authorizationUrl(verifier: string, state: string, nonce: string): Promise<URL>;
  exchange(callbackUrl: URL, verifier: string, state: string, nonce: string): Promise<GoogleIdentity>;
}

export const newSecret = () => randomBytes(32).toString("base64url");

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
        scope: "openid email",
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
      return validateGoogleIdentity(tokens.claims() as Record<string, unknown> | undefined);
    },
  };
}
