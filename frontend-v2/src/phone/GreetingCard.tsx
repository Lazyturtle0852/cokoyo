// フレンドから「YO！」が届いているとき（開いたとき・画面に戻ってきたときに取ってくる）
//
// 送ってきたフレンドはキャンパスにいる（今日キャンパスで在校確認した人しか送れない）。
// 開いた人にも在校確認を押してもらい、同じ日にキャンパスにいればマッチのポイントが入るようにする。
// 送り手がかくれんぼ中でも、送ったのは本人なので「キャンパスにいる」と出してよい。

import { useApp } from '../app/AppContext';
import { Avatar, when } from './ui';

export function GreetingCard() {
  const { view, greetings, friends, answerGreeting, dismissGreeting, checking } = useApp();
  if (view !== 'app' || !greetings.length || !friends) return null;
  const from = greetings
    .map((g) => ({ g, f: friends.friends.find((x) => x.userId === g.userId) }))
    .filter((x): x is { g: typeof x.g; f: NonNullable<typeof x.f> } => !!x.f);
  if (!from.length) return null;
  const first = from[0];
  const names = from.length > 1 ? `${first.f.displayName}さんほか${from.length - 1}人` : `${first.f.displayName}さん`;

  return (
    <>
      <div className="backdrop open" onClick={dismissGreeting} />
      <div className="invite-card" role="alertdialog" aria-labelledby="greetTitle" aria-describedby="greetBody">
        <Avatar userId={first.f.userId} name={first.f.displayName} avatar={first.f.avatar} on />
        <p className="invite-name">{names}</p>
        <h4 id="greetTitle">YO！されました</h4>
        <p id="greetBody" className="invite-body">
          {first.f.displayName}さんもキャンパスにいるようです（{when(first.g.at)}）。
          あなたもキャンパスにいたら、在校確認を押してみましょう。同じ日にキャンパスにいたフレンドの分も、ポイントが入ります。
        </p>
        <button className="btn btn-primary" disabled={checking} onClick={() => void answerGreeting()}>
          ポイント獲得<span className="btn-sub">（在校確認）</span>
        </button>
        <button className="btn btn-quiet" onClick={dismissGreeting}>あとで</button>
      </div>
    </>
  );
}
