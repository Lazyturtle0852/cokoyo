import type { Db } from "./db.js";
import { hashSecret, newSecret, newShareKey } from "./lib/keys.js";

export interface Person {
  id: number;
  share_key: string;
  mac: string;
}

export interface ConnectionRow {
  person_low: number;
  person_high: number;
  scope: "campus" | "building";
  blocked: number;
}

/** 常に (小さい方, 大きい方) の順に揃える。 */
function pair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export function createRepo(db: Db) {
  const selectByMac = db.prepare("SELECT id, share_key, mac FROM persons WHERE mac = ?");
  const selectBySecretHash = db.prepare(
    "SELECT id, share_key, mac FROM persons WHERE secret_hash = ?",
  );
  const selectByShareKey = db.prepare(
    "SELECT id, share_key, mac FROM persons WHERE share_key = ?",
  );
  const selectById = db.prepare("SELECT id, share_key, mac FROM persons WHERE id = ?");
  const insertPerson = db.prepare(
    "INSERT INTO persons (share_key, secret_hash, mac, created_at) VALUES (?, ?, ?, ?)",
  );
  const updateSecret = db.prepare("UPDATE persons SET secret_hash = ? WHERE id = ?");

  const selectConnection = db.prepare(
    "SELECT person_low, person_high, scope, blocked FROM connections WHERE person_low = ? AND person_high = ?",
  );
  const insertConnection = db.prepare(
    "INSERT OR IGNORE INTO connections (person_low, person_high, scope, blocked, created_at) VALUES (?, ?, 'campus', 0, ?)",
  );
  const updateConnectionStmt = db.prepare(
    "UPDATE connections SET scope = ?, blocked = ? WHERE person_low = ? AND person_high = ?",
  );
  const selectConnectionsOf = db.prepare(
    "SELECT person_low, person_high, scope, blocked FROM connections WHERE person_low = ? OR person_high = ? ORDER BY id",
  );

  const asPerson = (row: unknown): Person | undefined =>
    row ? ({ ...(row as Person) } as Person) : undefined;
  const asRow = (row: unknown): ConnectionRow | undefined =>
    row ? ({ ...(row as ConnectionRow) } as ConnectionRow) : undefined;

  return {
    findByMac: (mac: string) => asPerson(selectByMac.get(mac)),
    findBySecret: (secret: string) => asPerson(selectBySecretHash.get(hashSecret(secret))),
    findByShareKey: (shareKey: string) => asPerson(selectByShareKey.get(shareKey)),
    findById: (id: number) => asPerson(selectById.get(id)),

    /**
     * 登録。同じMACなら share_key は変わらない — フレンドに配り直す必要が出ないように。
     * secret だけは作り直す（平文を保存していないので返せないため）。
     * 結果として「再登録すると前の端末はログアウトされる」という挙動になる。
     */
    register(mac: string): { person: Person; secret: string } {
      const secret = newSecret();
      const existing = asPerson(selectByMac.get(mac));
      if (existing) {
        updateSecret.run(hashSecret(secret), existing.id);
        return { person: existing, secret };
      }
      insertPerson.run(newShareKey(), hashSecret(secret), mac, new Date().toISOString());
      const person = asPerson(selectByMac.get(mac));
      if (!person) throw new Error("failed to persist person");
      return { person, secret };
    },

    connect(a: number, b: number): ConnectionRow | undefined {
      const [low, high] = pair(a, b);
      insertConnection.run(low, high, new Date().toISOString());
      return asRow(selectConnection.get(low, high));
    },

    getConnection(a: number, b: number): ConnectionRow | undefined {
      const [low, high] = pair(a, b);
      return asRow(selectConnection.get(low, high));
    },

    updateConnection(
      a: number,
      b: number,
      next: { scope: "campus" | "building"; blocked: boolean },
    ): void {
      const [low, high] = pair(a, b);
      updateConnectionStmt.run(next.scope, next.blocked ? 1 : 0, low, high);
    },

    /** 自分から見た相手の一覧。無向なのでどちら側の列にいても拾う。 */
    listConnections(
      me: number,
    ): Array<{ other: Person; scope: "campus" | "building"; blocked: boolean }> {
      const out: Array<{ other: Person; scope: "campus" | "building"; blocked: boolean }> = [];
      for (const raw of selectConnectionsOf.all(me, me)) {
        const row = asRow(raw);
        if (!row) continue;
        const otherId = row.person_low === me ? row.person_high : row.person_low;
        const other = asPerson(selectById.get(otherId));
        if (other) out.push({ other, scope: row.scope, blocked: row.blocked !== 0 });
      }
      return out;
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
