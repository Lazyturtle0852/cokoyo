// フレンド追加のシート
//
//   QR          … 自分のQRを出す。下の「QRを読み込む」で、相手のQRを読むカメラに切り替わる
//   リンクで共有 … 招待リンクを送る・コピーする。共有キーも出しておく。
//                  相手のキーやMACアドレスを入力して申請するのもここ

import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { api } from '../api/client';
import { mockBackend } from '../api/mockBackend';
import { shareLink, useMockBackend } from '../config';
import { QrScanner } from './QrScanner';
import { drawStory, shareStory, tweetUrl } from './share';
import { Avatar } from './ui';

export function AddFriendSheet() {
  const { view, me, sheet, closeSheet, setAddMode, run, reloadFriends, showToast } = useApp();
  const [manualKey, setManualKey] = useState('');
  const [manualMac, setManualMac] = useState('');
  const open = view === 'app' && sheet.open && !!me;

  // ストーリーズの画像に貼るQRコード（画面には出さない）
  const qrBox = useRef<HTMLDivElement>(null);

  // タブを変えたら、シートの中もいちばん上から見せる
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => { sheetRef.current?.scrollTo({ top: 0 }); }, [sheet.mode, sheet.open]);

  const reset = () => { setManualKey(''); setManualMac(''); };

  const add = (shareKey: string, via: 'qr' | 'link', name: string) => run(name, async () => {
    const r = await api.addFriend(shareKey, via);
    await reloadFriends();
    closeSheet();
    reset();
    showToast(r.status === 'friends' ? `${r.user.displayName}さんとフレンドになりました` : `${r.user.displayName}さんに申請しました`);
  });

  // 共有キーもQRも渡せないとき用。相手が登録したMACアドレスで申請する。
  const addByMac = () => run('MACアドレスで申請', async () => {
    const r = await api.addFriendByMac(manualMac.trim().toLowerCase().replace(/-/g, ':'));
    await reloadFriends();
    closeSheet();
    reset();
    showToast(`${r.user.displayName}さんに申請しました`);
  });

  const link = me ? shareLink(me.shareKey) : '';
  const copy = async (text: string, done: string) => {
    try { await navigator.clipboard.writeText(text); showToast(done); }
    catch { showToast(text); }
  };
  // スマホなら LINE などに直接送れる。使えないブラウザ（パソコンなど）はコピーにする
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const sendLink = async () => {
    try { await navigator.share({ title: 'COKOYO', text: `${me?.displayName}さんからのフレンド招待`, url: link }); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') void copy(link, '招待リンクをコピーしました'); }
  };

  // インスタのストーリーズに貼る画像を作って、共有シート（または保存）に渡す
  const shareStoryImage = async () => {
    const qr = qrBox.current?.querySelector('canvas');
    if (!qr || !me) { showToast('画像を作れませんでした'); return; }
    try {
      const message = await shareStory(drawStory(qr, me.displayName, new URL(link).host), link);
      if (message) showToast(message);
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const candidates = useMockBackend && me
    ? mockBackend.sim.state(me.userId).people.filter((p) => p.relation === 'フレンドではない' || p.relation === '申請が届いている' || p.relation === '申請中')
    : [];

  const tab = sheet.mode === 'link' ? 'link' : 'qr';

  return (
    <>
      <div className={`backdrop${open ? ' open' : ''}`} onClick={closeSheet} />
      <div ref={sheetRef} className={`sheet${open ? ' open' : ''}`} role="dialog" aria-labelledby="sheetTitle" aria-hidden={!open}>
        {open && me && (
          <>
            <div className="grab" />
            <h4 id="sheetTitle">フレンドを追加</h4>
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={tab === 'qr'} className={tab === 'qr' ? 'on' : ''} onClick={() => setAddMode('show')}>QR</button>
              <button role="tab" aria-selected={tab === 'link'} className={tab === 'link' ? 'on' : ''} onClick={() => setAddMode('link')}>リンクで共有</button>
            </div>

            {sheet.mode === 'show' && (
              <>
                <p className="lead">目の前の相手に読み取ってもらいます。読み取ると、すぐにフレンドになります。</p>
                <div className="qr" aria-label="あなたのQRコード">
                  <QRCodeSVG value={link} size={148} level="M" fgColor="#1C1917" bgColor="#FFFFFF" />
                </div>
                <button className="btn btn-primary btn-icon" onClick={() => setAddMode('scan')}>
                  <ScanIcon />QRを読み込む
                </button>
              </>
            )}

            {sheet.mode === 'scan' && (
              <>
                <p className="lead">相手の「フレンドを追加」に出ているQRを読み取ります。読み取ると、すぐにフレンドになります。</p>
                <QrScanner onKey={(key) => {
                  if (key === me.shareKey) { showToast('これはあなた自身のQRコードです'); return; }
                  void add(key, 'qr', 'QRコードを読み取った');
                }} />
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
                <button className="btn btn-quiet" onClick={() => setAddMode('show')}>自分のQRを表示する</button>
              </>
            )}

            {sheet.mode === 'link' && (
              <>
                <p className="lead">LINE などで招待リンクを送ります。相手が開いて申請し、あなたが承認するとフレンドになります。</p>
                <div className="linkbox mono">{link}</div>
                {canShare && <button className="btn btn-primary" onClick={() => void sendLink()}>招待リンクを送る</button>}
                <button className={`btn ${canShare ? 'btn-quiet' : 'btn-primary'}`} onClick={() => void copy(link, '招待リンクをコピーしました')}>
                  招待リンクをコピー
                </button>

                <div className="keybox">
                  <div className="keybox-body">
                    <span className="keybox-cap">あなたの共有キー</span>
                    <span className="keybox-key mono">{me.shareKey}</span>
                  </div>
                  <button className="mini-btn" onClick={() => void copy(me.shareKey, '共有キーをコピーしました')}>コピー</button>
                </div>
                <p className="note">リンクが開けない相手には、このキーを伝えて「相手の共有キーを入力」から申請してもらえます。</p>

                <div className="sns">
                  <p className="sns-cap">SNSで誘う</p>
                  <div className="sns-row">
                    <button className="sns-btn x" onClick={() => window.open(tweetUrl(link), '_blank', 'noopener')}>
                      <XIcon />Xで共有
                    </button>
                    <button className="sns-btn ig" onClick={() => void shareStoryImage()}>
                      <StoryIcon />ストーリーズ
                    </button>
                  </div>
                  <p className="row-note">
                    受け取った人は、リンクを開いて登録するだけでフレンドの申請が飛びます（あなたが承認するとフレンドになります）。
                    「ストーリーズ」を押すと、貼るだけの画像（9:16）を作ります。QRコードが入っているので、画面を写してもらっても大丈夫です。
                  </p>
                </div>
                {/* 画像を作るときだけ使うQRコード。画面には出さない */}
                <div ref={qrBox} className="qr-hidden" aria-hidden="true">
                  <QRCodeCanvas value={link} size={480} level="M" marginSize={2} fgColor="#1C1917" bgColor="#FFFFFF" />
                </div>

                <details className="manual">
                  <summary>相手の共有キーを入力</summary>
                  <div className="field-row">
                    <input className="field mono" placeholder="sk_…" value={manualKey} autoComplete="off" autoCapitalize="off" spellCheck={false}
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

function XIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6.7L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z" />
    </svg>
  );
}

function StoryIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="3" /><circle cx="12" cy="10.5" r="3" /><path d="M9 17h6" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M4 12h16" />
    </svg>
  );
}
