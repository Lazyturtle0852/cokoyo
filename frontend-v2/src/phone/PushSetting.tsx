// 設定の「通知」：YO！が届いたとき・キャンパスに着いたときに、この端末に知らせる

import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { api } from '../api/client';
import { disablePush, enablePush, pushEnabled, pushSupport } from '../app/push';

export function PushSetting() {
  const { me, showToast } = useApp();
  const support = pushSupport();
  // undefined: 調べている  null: このサーバーでは使えない
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getPushKey().then((r) => { if (alive) setKey(r.publicKey); }).catch(() => { if (alive) setKey(null); });
    if (me) pushEnabled(me.userId).then((v) => { if (alive) setOn(v); }).catch(() => { /* 使えない環境 */ });
    return () => { alive = false; };
  }, [me?.userId]);

  if (!me || key === undefined || key === null) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setOn(false);
        showToast('通知をオフにしました');
      } else {
        await enablePush(key, me.userId);
        setOn(true);
        showToast('通知をオンにしました');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '通知を設定できませんでした');
    } finally {
      setBusy(false);
    }
  };

  return <>
    <div className="sec"><h3>通知</h3></div>
    <div className="card">
      <div className="kv">
        <div>
          <div className="k">この端末に通知する</div>
          <div className="row-note">
            フレンドがあなたにYO！したとき（同じ人からは30分に1回まで）と、
            キャンパスに着いてまだポイントを獲得していないとき（1日1回、8〜19時）に通知します。
            着いたかどうかは、オンにしているあいだだけ、登録した端末がキャンパスのWiFiに見えるかを数分おきに確かめます。
            通知にはフレンドの表示名が出るので、ロック画面で周りの人にも見えることがあります。
          </div>
        </div>
        {support === 'ok' && (
          <button className="swbtn" aria-pressed={on} disabled={busy} onClick={() => void toggle()}>
            <span className={`switch${on ? ' on' : ''}`} />{on ? 'オン' : 'オフ'}
          </button>
        )}
      </div>
      {support === 'ios-install' && (
        <p className="row-note push-note">
          iPhoneでは、ホーム画面に追加したCOKOYOから通知を受け取れます。
          Safariの共有ボタン（□に↑）→「ホーム画面に追加」をして、追加したアイコンから開き、ここでオンにしてください。
        </p>
      )}
      {support === 'unsupported' && <p className="row-note push-note">このブラウザは通知に対応していません。</p>}
    </div>
  </>;
}
