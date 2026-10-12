// 登録した端末から、その人がいまキャンパスにいるかを引く。
// 在校確認（routes.ts）と、キャンパスに着いた通知（arrival.ts）で使う。

import type { DtcClient, Lookup } from "./dtc.js";
import type { Repo, User } from "./repo.js";

/** 大学のAPIに同時に投げる数を抑える */
export function limiter(max: number) {
  let active = 0;
  const pending: Array<() => void> = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => pending.push(resolve));
    active++;
    try { return await work(); }
    finally { active--; pending.shift()?.(); }
  };
}

export async function lookupUser(repo: Repo, dtc: DtcClient, user: Pick<User, "id">, limited: ReturnType<typeof limiter>): Promise<Lookup> {
  const observations = await Promise.all(repo.listMacs(user.id).map((m) => limited(() => dtc.latest(m.mac))));
  const present = observations.filter((x): x is Extract<Lookup, { status: "present" }> => x.status === "present");
  if (present.length) {
    const keys = new Set(present.map((x) => x.buildingKey));
    const buildingKey = observations.some((x) => x.status === "unavailable") || keys.size !== 1
      ? undefined : present[0]?.buildingKey;
    return { status: "present", ...(buildingKey ? { buildingKey } : {}) };
  }
  return observations.some((x) => x.status === "unavailable")
    ? { status: "unavailable" } : { status: "absent" };
}
