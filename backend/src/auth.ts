import type { Context } from "hono";
import { fail } from "./lib/errors.js";
import type { Person, Repo } from "./repo.js";

/**
 * secret による認証。
 *
 * share_key（配る値）と secret（配らない値）を分けているのはここのため。
 * 1つのkeyで兼ねると、LINEでkeyを受け取った相手が「その人として」問い合わせられてしまい、
 * block も scope も守れなくなる。
 */
export function requirePerson(c: Context, repo: Repo): Person {
  const header = c.req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) fail("UNAUTHORIZED", "Missing bearer token");

  const person = repo.findBySecret(match[1]);
  if (!person) fail("UNAUTHORIZED", "Invalid token");
  return person;
}
