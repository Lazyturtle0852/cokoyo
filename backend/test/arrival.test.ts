import { describe, expect, it } from "vitest";
import { ARRIVAL_MESSAGE, checkArrivals } from "../src/arrival.js";
import { createHarness, MAC, present } from "./helpers.js";

const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
};

/** 日本時間の 2026-10-12 の hour 時 */
const jst = (hour: number, day = 12) => new Date(Date.UTC(2026, 9, day, hour - 9, 0));

async function setup() {
  const h = createHarness();
  const alice = await h.signUp("ゆうき", MAC.alice);
  const bob = await h.signUp("佐藤", MAC.bob);
  await alice.post("/v1/push/subscriptions", SUB);
  const aliceId = h.repo.findByUserId(alice.userId)!.id;
  return { h, alice, bob, aliceId };
}

describe("キャンパスに着いた通知", () => {
  it("通知をオンにした人がキャンパスに現れたら、1日1回だけ知らせる", async () => {
    const { h, aliceId } = await setup();
    h.dtc.set(MAC.alice, present("iota"));

    expect(await checkArrivals(h.repo, h.dtc, h.push, jst(10))).toBe(1);
    expect(h.push.sent).toEqual([{ userId: aliceId, message: { ...ARRIVAL_MESSAGE, url: "./?arrived=2026-10-12" } }]);

    // 同じ日はもう引きもしない
    h.dtc.asked.length = 0;
    expect(await checkArrivals(h.repo, h.dtc, h.push, jst(11))).toBe(0);
    expect(h.dtc.asked).toEqual([]);

    // 次の日はまた知らせる
    expect(await checkArrivals(h.repo, h.dtc, h.push, jst(10, 13))).toBe(1);
  });

  it("通知をオフにしている人の端末は引かない", async () => {
    const { h } = await setup();
    h.dtc.set(MAC.bob, present());
    await checkArrivals(h.repo, h.dtc, h.push, jst(10));
    expect(h.dtc.asked).not.toContain(MAC.bob);
    expect(h.push.sent).toEqual([]);
  });

  it("いない・判定できないときは知らせず、来たら知らせる", async () => {
    const { h } = await setup();
    expect(await checkArrivals(h.repo, h.dtc, h.push, jst(9))).toBe(0);
    h.dtc.set(MAC.alice, { status: "unavailable" });
    expect(await checkArrivals(h.repo, h.dtc, h.push, jst(9))).toBe(0);
    h.dtc.set(MAC.alice, present());
    expect(await checkArrivals(h.repo, h.dtc, h.push, jst(10))).toBe(1);
  });

  it("今日もう在校確認でポイントを得た人には知らせない", async () => {
    const { h, alice } = await setup();
    h.dtc.set(MAC.alice, present());
    await alice.post("/v1/checks");
    h.dtc.asked.length = 0;
    expect(await checkArrivals(h.repo, h.dtc, h.push, new Date(Date.now()))).toBe(0);
    expect(h.dtc.asked).toEqual([]);
  });

  it("夜と早朝は見張らない", async () => {
    const { h } = await setup();
    h.dtc.set(MAC.alice, present());
    expect(await checkArrivals(h.repo, h.dtc, h.push, jst(7))).toBe(0);
    expect(await checkArrivals(h.repo, h.dtc, h.push, jst(19))).toBe(0);
    expect(h.dtc.asked).toEqual([]);
  });

  it("ログアウトしている人は引かない", async () => {
    const { h, alice } = await setup();
    h.dtc.set(MAC.alice, present());
    await alice.post("/v1/auth/logout");
    await checkArrivals(h.repo, h.dtc, h.push, jst(10));
    expect(h.dtc.asked).toEqual([]);
  });
});
