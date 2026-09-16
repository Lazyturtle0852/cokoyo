// 画面右の「デモ操作」。アプリ本体ではない（本物のアプリには要らない）

import { useReducer } from 'react';
import { useApp } from '../app/AppContext';
import { device } from '../api/client';
import { BUILDINGS, buildingLabel, mockBackend } from '../api/mockBackend';
import { config, useMockBackend } from '../config';

const sim = mockBackend.sim;

export function DemoPanel() {
  const app = useApp();
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  if (!useMockBackend) {
    return (
      <section className="panel">
        <h2>デモ操作</h2>
        <p className="empty">本物のバックエンド（<span className="mono">{config.apiBaseUrl}</span>）に接続しています。キャンパスの様子は、バックエンドと大学側APIの状態で決まります。</p>
      </section>
    );
  }

  const uid = app.me?.userId ?? sim.userIdForToken(device.token);
  const st = sim.state(uid);
  const mine = st.people.find((p) => p.userId === uid);
  const others = st.people.filter((p) => p.userId !== uid);
  const rows = mine ? [mine, ...others] : others;

  const hint = () => { rerender(); app.showToast('アプリで「ポイント獲得」を押すと反映されます'); };
  const bestCandidates = (app.friends?.friends ?? []).filter((f) => f.best === 'none').slice(0, 2);

  const reset = async () => {
    sim.reset();
    try { Object.keys(localStorage).filter((k) => k.startsWith('cokoyo-lastcheck:')).forEach((k) => localStorage.removeItem(k)); } catch { /* 保存できない環境 */ }
    device.set(sim.demoToken);
    await app.restart();
    app.showToast('最初の状態に戻しました');
  };

  return (
    <section className="panel">
      <h2>デモ操作</h2>
      <p className="desc">実際にはバックエンドと大学側APIが持っている情報です。アプリからは直接見えません。</p>

      <p className="plabel first">キャンパスの様子（大学側APIが返す内容）</p>
      <div className="simwrap">
        <table className="sim">
          <thead><tr><th>人</th><th>キャンパスのWiFi</th><th>建物</th><th>かくれんぼ</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.userId}>
                <td><span className="pname">{p.name}</span><span className={`rel${p.relation === 'あなた' ? ' me' : ''}`}>{p.relation}</span></td>
                <td>
                  <button className="swbtn" aria-pressed={p.connected} onClick={() => { sim.setCampus(p.userId, { connected: !p.connected }); hint(); }}>
                    <span className={`switch${p.connected ? ' on' : ''}`} />{p.connected ? '接続中' : '未接続'}
                  </button>
                </td>
                <td>
                  <select value={p.buildingKey} aria-label={`${p.name}のいる建物`} onChange={(e) => { sim.setCampus(p.userId, { buildingKey: e.target.value as typeof BUILDINGS[number] }); hint(); }}>
                    {BUILDINGS.map((b) => <option key={b} value={b}>{buildingLabel(b)}</option>)}
                  </select>
                </td>
                <td>
                  {p.userId === uid ? <span className="muted">アプリで操作</span> : (
                    <button className="swbtn" aria-pressed={p.hidden} onClick={() => { sim.setHidden(p.userId, !p.hidden); hint(); }}>
                      <span className={`switch hide${p.hidden ? ' on' : ''}`} />{p.hidden ? 'オン' : 'オフ'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="plabel">相手の操作</p>
      <div className="row">
        {uid && others.filter((p) => p.relation === 'フレンドではない').map((p) => (
          <button className="ghost" key={p.userId} onClick={async () => { sim.openMyLink(p.userId, uid); await app.refresh(); rerender(); app.showToast('フレンド申請が届きました'); }}>
            {p.name}さんが招待リンクを開く
          </button>
        ))}
        {uid && bestCandidates.map((f) => (
          <button className="ghost" key={f.userId} onClick={async () => { sim.requestBestFrom(f.userId, uid); await app.refresh(); rerender(); app.showToast('ベストフレンドの申請が届きました'); }}>
            {f.displayName}さんがベストフレンドを申請
          </button>
        ))}
      </div>

      <p className="plabel">天気（雨の日ボーナス用）</p>
      <div className="row">
        <div className="pill-seg">
          <button className={st.weather !== 'rain' ? 'on' : ''} onClick={() => { sim.setWeather('mainly_clear'); hint(); }}>晴れ</button>
          <button className={st.weather === 'rain' ? 'on' : ''} onClick={() => { sim.setWeather('rain'); hint(); }}>雨</button>
        </div>
      </div>

      <p className="plabel">やり直す</p>
      <div className="row">
        <button className="ghost" onClick={() => void reset()}>デモを最初の状態に戻す</button>
        <button className="ghost" onClick={app.restartFromOnboarding}>登録画面から始める</button>
      </div>
    </section>
  );
}
