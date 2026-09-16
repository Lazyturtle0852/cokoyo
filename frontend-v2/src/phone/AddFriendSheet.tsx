// フレンド追加のシート（QRを見せる／QRを読み取る）

import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { api } from '../api/client';
import { mockBackend } from '../api/mockBackend';
import { config, useMockBackend } from '../config';
import { Avatar } from './ui';

export function AddFriendSheet() {
  const { view, me, sheet, closeSheet, setAddMode, run, reloadFriends, showToast } = useApp();
  const [manualKey, setManualKey] = useState('');
  const [manualMac, setManualMac] = useState('');
  const open = view === 'app' && sheet.open && !!me;

  const add = (shareKey: string, via: 'qr' | 'link', name: string) => run(name, async () => {
    const r = await api.addFriend(shareKey, via);
    await reloadFriends();
    closeSheet();
    setManualKey('');
    setManualMac('');
    showToast(r.status === 'friends' ? `${r.user.displayName}さんとフレンドになりました` : `${r.user.displayName}さんに申請しました`);
  });

  // 共有キーもQRも渡せないとき用。相手が登録したMACアドレスで申請する。
  const addByMac = () => run('MACアドレスで申請', async () => {
    const r = await api.addFriendByMac(manualMac.trim().toLowerCase().replace(/-/g, ':'));
    await reloadFriends();
    closeSheet();
    setManualKey('');
    setManualMac('');
    showToast(`${r.user.displayName}さんに申請しました`);
  });

  const link = me ? config.shareLinkBase + me.shareKey : '';
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); showToast('招待リンクをコピーしました'); }
    catch { showToast(link); }
  };

  const candidates = useMockBackend && me
    ? mockBackend.sim.state(me.userId).people.filter((p) => p.relation === 'フレンドではない' || p.relation === '申請が届いている' || p.relation === '申請中')
    : [];

  return (
    <>
      <div className={`backdrop${open ? ' open' : ''}`} onClick={closeSheet} />
      <div className={`sheet${open ? ' open' : ''}`} role="dialog" aria-labelledby="sheetTitle" aria-hidden={!open}>
        {open && me && (
          <>
            <div className="grab" />
            <h4 id="sheetTitle">フレンドを追加</h4>
            <div className="seg" role="tablist">
              <button role="tab" className={sheet.mode === 'show' ? 'on' : ''} onClick={() => setAddMode('show')}>QRを見せる</button>
              <button role="tab" className={sheet.mode === 'scan' ? 'on' : ''} onClick={() => setAddMode('scan')}>QRを読み取る</button>
            </div>

            {sheet.mode === 'show' ? (
              <>
                <p className="lead">目の前の相手に読み取ってもらいます。読み取ると、すぐにフレンドになります。</p>
                <div className="qr" aria-label="あなたのQRコード">
                  <QRCodeSVG value={link} size={148} level="M" fgColor="#1C1917" bgColor="#FFFFFF" />
                </div>
                <p className="sharekey">共有キー <span className="mono">{me.shareKey}</span></p>
                <button className="btn btn-quiet" onClick={() => void copyLink()}>招待リンクをコピー</button>
                <p className="note">リンクで送った場合は、相手が開いたあと、あなたが承認するとフレンドになります。</p>
              </>
            ) : (
              <>
                <div className="camera" aria-hidden="true">
                  <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
                  <span className="camera-text">相手のQRコードを枠に合わせてください</span>
                </div>
                {candidates.length > 0 && (
                  <>
                    <p className="demo-cap">（デモ）読み取る相手を選ぶ</p>
                    <div className="cands">
                      {candidates.map((p) => (
                        <button className="cand" key={p.userId} onClick={() => void add(p.shareKey, 'qr', 'QRコードを読み取った')}>
                          <Avatar userId={p.userId} name={p.name} small /><span>{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <details className="manual">
                  <summary>読み取れないとき：共有キーを入力</summary>
                  <div className="field-row">
                    <input className="field mono" placeholder="sk_…" value={manualKey} autoComplete="off" spellCheck={false}
                      onChange={(e) => setManualKey(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void add(manualKey.trim(), 'link', '共有キーで申請'); }} />
                    <button className="mini-btn primary" onClick={() => void add(manualKey.trim(), 'link', '共有キーで申請')}>申請</button>
                  </div>
                  <p className="row-note">入力した場合は、相手の承認でフレンドになります。</p>
                </details>
                <details className="manual">
                  <summary>高度な設定：MACアドレスで追加</summary>
                  <p className="row-note">
                    共有キーも渡せないとき用です。相手が登録したMACアドレス（相手の設定アプリに出ている値）を入力すると、
                    相手に申請が届きます。共有キーのときと同じで、相手が承認するとフレンドになります。
                  </p>
                  <div className="field-row">
                    <input className="field mono" placeholder="例）a2:3f:9c:1b:7e:44" value={manualMac}
                      autoComplete="off" autoCapitalize="off" spellCheck={false}
                      onChange={(e) => setManualMac(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void addByMac(); }} />
                    <button className="mini-btn primary" onClick={() => void addByMac()}>申請</button>
                  </div>
                  <p className="row-note warn">
                    MACアドレスを渡すと、その人はあなたがキャンパスに居るかどうかを調べられるようになります。
                    <b>仲のいい友達とだけ</b>交換してください。
                  </p>
                </details>
              </>
            )}
            <button className="btn btn-quiet" onClick={closeSheet}>閉じる</button>
          </>
        )}
      </div>
    </>
  );
}
