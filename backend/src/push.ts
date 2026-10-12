// プッシュ通知（Web Push）
//
// ブラウザが「この宛先に送ってください」と渡してくる URL（Apple・Google・Mozilla などの通知サーバー）に、
// 暗号化した中身を送る。中身を読めるのは受け取った端末だけで、通知サーバーには読めない。
//
// 送るための鍵（VAPID）は、環境変数に無ければ初回に作って DB に保存する。
// 鍵を変えると、それまでの購読がすべて使えなくなるので、一度作ったら変えない。

import webpush from "web-push";
import type { Repo } from "./repo.js";

export interface PushMessage {
  title: string;
  body: string;
  /** 通知を押したときに開く場所（アプリの中のパス） */
  url: string;
  /** 同じ tag の通知は、端末の上で1つにまとまる */
  tag: string;
}

export interface PushSender {
  /** 購読に使う公開鍵。null なら通知は使えない */
  publicKey(): string | null;
  /** その人の端末すべてに送る。失敗しても投げない */
  send(userId: number, message: PushMessage): Promise<void>;
}

/** Apple は送り主の連絡先に localhost を受け付けないので、本番のURLを名乗る */
const SUBJECT = "https://cokoyo.lazyta-toru.net";

/** 通知サーバーが受け取ってから、端末に届けるのをあきらめるまで（秒） */
const TTL_SECONDS = 60 * 60;

export function createPushSender(repo: Repo): PushSender {
  let keys: { publicKey: string; privateKey: string } | null = null;
  const vapid = () => {
    if (keys) return keys;
    const fromEnv = { publicKey: process.env.VAPID_PUBLIC_KEY ?? "", privateKey: process.env.VAPID_PRIVATE_KEY ?? "" };
    keys = fromEnv.publicKey && fromEnv.privateKey
      ? fromEnv
      : JSON.parse(repo.secret("vapid", () => JSON.stringify(webpush.generateVAPIDKeys()))) as { publicKey: string; privateKey: string };
    return keys;
  };

  return {
    publicKey: () => vapid().publicKey,

    async send(userId, message) {
      // ログインの期限が切れた人（どの端末でもログアウトしている人）には送らず、宛先も捨てる
      if (!repo.hasLiveSession(userId)) { repo.deletePushOf(userId); return; }
      const { publicKey, privateKey } = vapid();
      const payload = JSON.stringify(message);
      await Promise.all(repo.listPush(userId).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { vapidDetails: { subject: SUBJECT, publicKey, privateKey }, TTL: TTL_SECONDS, timeout: 10_000 },
          );
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // 通知を切った・アプリを消した端末。宛先を捨てる
          if (status === 404 || status === 410) repo.forgetPush(sub.endpoint);
          else console.error("push failed:", status ?? (e instanceof Error ? e.name : "unknown"));
        }
      }));
    },
  };
}
