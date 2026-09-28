// 設定：表示名・アイコン・MACアドレスの登録し直し・ログアウト・このアプリについて

import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { api } from '../api/client';
import { config, useMockBackend } from '../config';
import { AvatarPicker } from './AvatarPicker';
import { fullDate } from './ui';

export function Settings() {
  const { me, run, setMe, showToast, startReregister, logout } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [armedLogout, setArmedLogout] = useState(false);
  if (!me) return null;

  const save = async () => {
    const ok = await run('表示名を変更', async () => { setMe(await api.updateMe({ displayName: name })); showToast('表示名を変更しました'); });
    if (ok) setEditing(false);
  };

  return (
    <>
      <div className="sec"><h3>プロフィール</h3></div>
      <div className="card">
        {editing ? (
          <>
            <label className="field-label" htmlFor="nameEdit">表示名</label>
            <input className="field" id="nameEdit" maxLength={20} value={name} autoFocus
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
            <div className="inline-actions">
              <button className="mini-btn primary" onClick={() => void save()}>保存</button>
              <button className="mini-btn" onClick={() => setEditing(false)}>やめる</button>
            </div>
          </>
        ) : (
          <div className="kv">
            <div><div className="k">表示名</div><div className="v">{me.displayName}</div></div>
            <button className="mini-btn" onClick={() => { setName(me.displayName); setEditing(true); }}>変更</button>
          </div>
        )}
        <p className="row-note">フレンドの画面に表示されます</p>
        <AvatarPicker />
      </div>

      <div className="sec"><h3>キャンパスの検知</h3></div>
      <div className="card">
        <div className="kv"><div><div className="k">登録しているMACアドレス</div><div className="v mono">{me.macMasked}</div></div></div>
        <p className="row-note">{fullDate(me.macRegisteredAt)}に登録。機種変更やWiFi設定のリセットをすると変わります。キャンパスにいるのに「キャンパス外」になるときは、登録し直してください。</p>
        <button className="btn btn-quiet" onClick={startReregister}>MACアドレスを登録し直す</button>
      </div>

      <div className="sec"><h3>この端末</h3></div>
      <div className="card">
        <p className="row-note">
          一度登録すれば、同じ端末では入れたままになります。ログアウトすると、この端末の覚えを消します。
          登録そのものは残るので、同じMACアドレスを入れればいつでも戻れます。
        </p>
        {armedLogout ? (
          <div className="confirm">
            <p>ログアウトしますか？ もう一度使うときは、MACアドレスの入力が必要です。</p>
            <div className="confirm-actions">
              <button className="mini-btn danger" onClick={() => void logout()}>ログアウトする</button>
              <button className="mini-btn" onClick={() => setArmedLogout(false)}>やめる</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-quiet" onClick={() => setArmedLogout(true)}>ログアウト</button>
        )}
      </div>

      <div className="sec"><h3>このアプリについて</h3></div>
      <div className="card about">
        <p>位置情報は使いません。キャンパスのWiFiにつながっているかどうかを、大学側のAPIに問い合わせて確認します。</p>
        <p className="muted">試作品・{useMockBackend ? 'バックエンドは模擬' : `接続先 ${config.apiBaseUrl}`}</p>
      </div>
    </>
  );
}
