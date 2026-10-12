// キャンパスに着いたという通知から開かれたとき、在校確認をすすめる
//
// 通知はサーバーが大学のAPIで見つけて送ってくる（backend/src/arrival.ts）。1人1日1回まで。
// 開くまでに時間がたっていることもあるので「着いたようです」とだけ言い、確かめるのは在校確認に任せる。

import { useApp } from '../app/AppContext';
import { Icon, isToday } from './ui';

export function ArrivalCard() {
  const { view, arrival, greetings, lastCheck, answerArrival, dismissArrival, checking } = useApp();
  // 今日もう在校を確かめていれば、出す意味が無い
  const done = !!lastCheck && isToday(lastCheck.checkedAt) && lastCheck.me.presence === 'present';
  // YO！が届いていれば、そちらのカードで在校確認をすすめているので重ねない
  if (view !== 'app' || !arrival || done || greetings.length) return null;

  return (
    <>
      <div className="backdrop open" onClick={dismissArrival} />
      <div className="invite-card" role="alertdialog" aria-labelledby="arrivalTitle" aria-describedby="arrivalBody">
        <span className="arrival-ico" aria-hidden="true"><Icon.Wifi /></span>
        <h4 id="arrivalTitle">キャンパスに着きましたね</h4>
        <p id="arrivalBody" className="invite-body">
          キャンパスのWiFiに、あなたの端末が見えました。
          「ポイント獲得」を押して、今日の来校ポイントを受け取りましょう。キャンパスにいるフレンドの分も入ります。
        </p>
        <button className="btn btn-primary" disabled={checking} onClick={() => void answerArrival()}>
          ポイント獲得<span className="btn-sub">（在校確認）</span>
        </button>
        <button className="btn btn-quiet" onClick={dismissArrival}>あとで</button>
      </div>
    </>
  );
}
