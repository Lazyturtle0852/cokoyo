import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { api } from '../api/client';
import { config, useMockBackend } from '../config';
import { AvatarPicker } from './AvatarPicker';
import { Feedback } from './Feedback';
import { MacGuide } from './MacGuide';
import { fullDate } from './ui';

const normalizeMac = (value: string) => value.trim().toLowerCase().replace(/-/g, ':');

export function Settings() {
  const { me, run, setMe, showToast, restart } = useApp();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [editingMacId, setEditingMacId] = useState<number | 'new' | null>(null);
  const [mac, setMac] = useState('');
  const [label, setLabel] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  if (!me) return null;

  const refreshMe = async () => setMe(await api.getMe());
  const saveName = async () => {
    const ok = await run('表示名を変更', async () => { setMe(await api.updateMe({ displayName: name })); showToast('表示名を変更しました'); });
    if (ok) setEditingName(false);
  };
  const saveMac = async () => {
    const value = normalizeMac(mac);
    const ok = await run('端末を保存', async () => {
      if (editingMacId === 'new') await api.addMac(value, label.trim());
      else if (typeof editingMacId === 'number') await api.editMac(editingMacId, { mac: value || undefined, label: label.trim() });
      await refreshMe(); showToast('端末を保存しました');
    });
    if (ok) { setEditingMacId(null); setMac(''); setLabel(''); }
  };
  const removeMac = async () => {
    if (deleteId === null) return;
    const ok = await run('端末を削除', async () => { await api.deleteMac(deleteId); await refreshMe(); showToast('端末を削除しました'); });
    if (ok) setDeleteId(null);
  };
  const logout = async (all: boolean) => {
    await run(all ? '全端末からログアウト' : 'ログアウト', async () => {
      if (all) await api.logoutAll(); else await api.logout();
      try { Object.keys(localStorage).filter((key) => key.startsWith('cokoyo-lastcheck:')).forEach((key) => localStorage.removeItem(key)); } catch { /* 保存できない環境 */ }
      await restart();
    });
  };

  return <>
    <div className="sec"><h3>プロフィール</h3></div>
    <div className="card">
      {editingName ? <>
        <label className="field-label" htmlFor="nameEdit">表示名</label>
        <input className="field" id="nameEdit" maxLength={20} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        <div className="inline-actions"><button className="mini-btn primary" onClick={() => void saveName()}>保存</button><button className="mini-btn" onClick={() => setEditingName(false)}>やめる</button></div>
      </> : <div className="kv"><div><div className="k">表示名</div><div className="v">{me.displayName}</div></div><button className="mini-btn" onClick={() => { setName(me.displayName); setEditingName(true); }}>変更</button></div>}
      <p className="row-note">フレンドの画面に表示されます</p>
      <AvatarPicker />
    </div>

    <div className="sec"><h3>キャンパスの検知</h3><span>{me.macs.length} / 5台</span></div>
    <div className="card">
      <p className="row-note">登録した端末のどれかがキャンパスのWiFiにつながると、在校と判定します。</p>
      {me.macs.map((item) => <div className="mac-device" key={item.id}>
        <div className="kv"><div><div className="k">{item.label}</div><div className="v mono">{item.macMasked}</div></div>
          <button className="mini-btn" onClick={() => { setEditingMacId(item.id); setLabel(item.label); setMac(''); }}>編集</button></div>
        <p className="row-note">{fullDate(item.registeredAt)}に登録</p>
        <button className="mini-btn" disabled={me.macs.length <= 1} onClick={() => setDeleteId(item.id)}>削除</button>
      </div>)}
      {editingMacId !== null && <div className="mac-editor">
        <h4>{editingMacId === 'new' ? '端末を追加' : '端末を編集'}</h4>
        <details className="manual">
          <summary>MACアドレスの調べ方</summary>
          <MacGuide />
        </details>
        <label className="field-label" htmlFor="macLabel">端末の名前</label>
        <input className="field" id="macLabel" maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} />
        <label className="field-label" htmlFor="macValue">MACアドレス{editingMacId === 'new' ? '' : '（変更する場合のみ）'}</label>
        <input className="field mono" id="macValue" value={mac} placeholder="例）a2:3f:9c:1b:7e:44" autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => setMac(e.target.value)} />
        <div className="inline-actions"><button className="mini-btn primary" onClick={() => void saveMac()}>保存</button><button className="mini-btn" onClick={() => setEditingMacId(null)}>やめる</button></div>
      </div>}
      {deleteId !== null && <div className="notice" role="alertdialog" aria-label="端末の削除確認">
        <p>この端末を削除すると、在校判定に使われなくなります。</p>
        <div className="inline-actions"><button className="mini-btn primary" onClick={() => void removeMac()}>削除する</button><button className="mini-btn" onClick={() => setDeleteId(null)}>やめる</button></div>
      </div>}
      {editingMacId === null && <button className="btn btn-quiet" disabled={me.macs.length >= 5} onClick={() => { setEditingMacId('new'); setLabel('新しい端末'); setMac(''); }}>端末を追加</button>}
    </div>

    <div className="sec"><h3>アカウント</h3></div>
    <div className="card">
      <div className="kv"><div><div className="k">Googleアカウント</div><div className="v account-email">{me.email}</div></div></div>
      <p className="row-note">ログイン状態は14日間有効です。</p>
      <button className="btn btn-quiet" onClick={() => void logout(false)}>ログアウト</button>
      <button className="btn btn-quiet" onClick={() => void logout(true)}>すべての端末からログアウト</button>
    </div>

    <div className="sec"><h3>知り合いかも</h3></div>
    <div className="card">
      <div className="kv">
        <div>
          <div className="k">知り合いかもに出す</div>
          <div className="row-note">
            フレンドのフレンドの画面に、あなたが「知り合いかも」として出ます。
            オフにすると出ません（すでにフレンドの人からの見え方は変わりません）。
          </div>
        </div>
        <button className="swbtn" aria-pressed={me.discoverable}
          onClick={() => void run('知り合いかもの設定', async () => {
            setMe(await api.updateMe({ discoverable: !me.discoverable }));
            showToast(me.discoverable ? '知り合いかもに出さないようにしました' : '知り合いかもに出るようにしました');
          })}>
          <span className={`switch${me.discoverable ? ' on' : ''}`} />{me.discoverable ? 'オン' : 'オフ'}
        </button>
      </div>
    </div>

    <div className="sec"><h3>ご意見・問い合わせ</h3></div>
    <div className="card"><Feedback /></div>

    <div className="sec"><h3>このアプリについて</h3></div>
    <div className="card about"><p>位置情報は使いません。キャンパスのWiFiにつながっているかどうかを、大学側のAPIに問い合わせて確認します。</p><p className="muted">試作品・{useMockBackend ? 'バックエンドは模擬' : `接続先 ${config.apiBaseUrl}`}</p></div>
  </>;
}
