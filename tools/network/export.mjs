// 交友関係を、誰だか分からない形にして書き出す（ネットワーク分析用）。
//
// 本番(VPS)で、コンテナの中の Node に標準入力から渡して動かす。DB は読むだけ。
//   docker compose -f deploy/docker-compose.yml exec -T api \
//     node --input-type=module - < tools/network/export.mjs > network.json
//
// 出すのは「番号と番号がつながっている」だけ。
//   - 名前・メール・Google ID・アイコン・色・MAC・共有キーは読まない。
//   - 番号は DB の id ではなく、毎回ランダムに振り直す。id は登録順なので、
//     そのまま出すと「最初に登録した人＝運営者」のように当たりがつくため。
//     対応表はどこにも残さないので、書き出したあとは運営者も元に戻せない。
//   - 線の並びもランダムにする（DB の並びはフレンドになった順）。
//   - 日時は出さない。
import { randomInt } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.DB_PATH ?? "./data/cokoyo.db", { readOnly: true });

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 登録を終えた人だけ。フレンドが0人の人も点として数える。
const ids = db.prepare("SELECT id FROM users WHERE onboarding_completed_at IS NOT NULL").all().map((r) => Number(r.id));
const alias = new Map(shuffle([...ids]).map((id, i) => [id, i]));

const edges = [];
for (const r of db.prepare("SELECT user_low, user_high, best_low, best_high FROM friendships WHERE status = 'friends'").all()) {
  const a = alias.get(Number(r.user_low));
  const b = alias.get(Number(r.user_high));
  if (a === undefined || b === undefined) continue;
  // 3つ目は「お互いにベストフレンド」なら 1。片方だけの指定は向きが出るので捨てる。
  const best = Number(r.best_low) === 1 && Number(r.best_high) === 1 ? 1 : 0;
  edges.push(randomInt(2) ? [a, b, best] : [b, a, best]);
}

process.stdout.write(JSON.stringify({ nodes: ids.length, edges: shuffle(edges) }) + "\n");
