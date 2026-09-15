// フレンド：追加・かくれんぼ・届いている申請・フレンド（ベストフレンド／ブロック）・承認待ち・ブロック中

import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { api } from '../api/client';
import type { Friend } from '../api/types';
import { HideCard } from './HideCard';
import { Avatar, fullDate, Icon } from './ui';

export function Friends() {
  const { friends, run, reloadFriends, showToast, openAddSheet } = useApp();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [armedBlock, setArmedBlock] = useState<string | null>(null);
  if (!friends) return null;

  const { requests, blocked } = friends;
  const incomingBest = friends.friends.filter((f) => f.best === 'incoming');

  const act = (name: string, fn: () => Promise<string>) =>
    run(name, async () => { const message = await fn(); await reloadFriends(); showToast(message); });

  const acceptRequest = (id: string) => act('フレンド申請を承認', async () => `${(await api.acceptRequest(id)).user.displayName}さんとフレンドになりました`);
  const declineRequest = (id: string) => act('フレンド申請を断る', async () => { await api.declineRequest(id); return '申請を断りました'; });
  const requestBest = (f: Friend, label: string) => act(`ベストフレンドを${label}`, async () => {
    const r = await api.requestBest(f.userId);
    return r.best === 'best' ? `${f.displayName}さんとベストフレンドになりました` : `${f.displayName}さんにベストフレンドを申請しました`;
  });
  const endBest = (f: Friend, label: '取り消し' | '断る' | 'やめる') => act(`ベストフレンドを${label}`, async () => {
    await api.endBest(f.userId);
    return { 取り消し: '申請を取り消しました', 断る: '申請を断りました', やめる: `${f.displayName}さんとのベストフレンドをやめました` }[label];
  });
  const block = async (f: Friend) => {
    const ok = await act('ブロック', async () => { await api.block(f.userId); return `${f.displayName}さんをブロックしました`; });
    if (ok) { setExpanded(null); setArmedBlock(null); }
  };
  const unblock = (userId: string, name: string) => act('ブロックを解除', async () => { await api.unblock(userId); return `${name}さんのブロックを解除しました`; });

  const hasRequests = requests.incoming.length + incomingBest.length > 0;

  return (
    <>
      <button className="btn btn-primary btn-add" onClick={() => openAddSheet()}><Icon.Plus />フレンドを追加</button>

      <div className="sec"><h3>あなたの見え方</h3></div>
      <HideCard />

      {hasRequests && (
        <>
          <div className="sec"><h3>届いている申請</h3><span>{requests.incoming.length + incomingBest.length}件</span></div>
          <div className="card">
            {requests.incoming.map((r) => (
              <div className="req" key={r.requestId}>
                <Avatar userId={r.userId} name={r.displayName} />
                <div className="fbody"><div className="fname">{r.displayName}</div><div className="fmeta">リンクからフレンド申請</div></div>
                <div className="req-actions">
                  <button className="mini-btn primary" onClick={() => void acceptRequest(r.requestId)}>承認</button>
                  <button className="mini-btn" onClick={() => void declineRequest(r.requestId)}>断る</button>
                </div>
              </div>
            ))}
            {incomingBest.map((f) => (
              <div className="req" key={`best-${f.userId}`}>
                <Avatar userId={f.userId} name={f.displayName} />
                <div className="fbody"><div className="fname">{f.displayName}</div><div className="fmeta best-meta">ベストフレンドの申請</div></div>
                <div className="req-actions">
                  <button className="mini-btn best" onClick={() => void requestBest(f, '承認')}>承認</button>
                  <button className="mini-btn" onClick={() => void endBest(f, '断る')}>断る</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sec"><h3>フレンド</h3><span>{friends.friends.length}人</span></div>
      <div className="card">
        {friends.friends.length === 0 && <div className="pt-empty">まだフレンドがいません。「フレンドを追加」から始めましょう</div>}
        {friends.friends.map((f) => {
          const open = expanded === f.userId;
          const armed = armedBlock === f.userId;
          return (
            <div className={`frow${open ? ' open' : ''}`} key={f.userId}>
              <button className="frow-head" aria-expanded={open}
                onClick={() => { setExpanded(open ? null : f.userId); setArmedBlock(null); }}>
                <Avatar userId={f.userId} name={f.displayName} />
                <span className="fbody">
                  <span className="fname">
                    {f.displayName}
                    {f.best === 'best' && <span className="star">ベスト</span>}
                    {f.best === 'outgoing' && <span className="pending">ベスト申請中</span>}
                    {f.best === 'incoming' && <span className="pending">申請が届いています</span>}
                  </span>
                  <span className="fmeta">{fullDate(f.friendsSince)}からフレンド</span>
                </span>
                <span className="chev"><Icon.Chevron /></span>
              </button>
              {open && (
                <div className="frow-body">
                  {f.best === 'none' && (
                    <>
                      <button className="row-btn" onClick={() => void requestBest(f, '申請')}>ベストフレンドを申請</button>
                      <p className="row-note">相手が承認すると、お互いにどの建物にいるかまで見えるようになります</p>
                    </>
                  )}
                  {f.best === 'outgoing' && <button className="row-btn" onClick={() => void endBest(f, '取り消し')}>ベストフレンドの申請を取り消す</button>}
                  {f.best === 'incoming' && <button className="row-btn best" onClick={() => void requestBest(f, '承認')}>ベストフレンドの申請を承認</button>}
                  {f.best === 'best' && (
                    <>
                      <button className="row-btn" onClick={() => void endBest(f, 'やめる')}>ベストフレンドをやめる</button>
                      <p className="row-note">やめると、お互いに「キャンパスにいるか」だけが見える状態に戻ります</p>
                    </>
                  )}
                  {armed ? (
                    <div className="confirm">
                      <p>{f.displayName}さんをブロックしますか？ お互いの在校が見えなくなります。相手には知らせず、相手からは「いません」に見えます。</p>
                      <div className="confirm-actions">
                        <button className="mini-btn danger" onClick={() => void block(f)}>ブロックする</button>
                        <button className="mini-btn" onClick={() => setArmedBlock(null)}>やめる</button>
                      </div>
                    </div>
                  ) : (
                    <button className="row-btn danger" onClick={() => setArmedBlock(f.userId)}>ブロック</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {requests.outgoing.length > 0 && (
        <>
          <div className="sec"><h3>承認待ち</h3><span>{requests.outgoing.length}件</span></div>
          <div className="card">
            {requests.outgoing.map((r) => (
              <div className="req" key={r.requestId}>
                <Avatar userId={r.userId} name={r.displayName} off />
                <div className="fbody"><div className="fname">{r.displayName}</div><div className="fmeta">相手の承認を待っています</div></div>
              </div>
            ))}
          </div>
        </>
      )}

      {blocked.length > 0 && (
        <>
          <div className="sec"><h3>ブロック中</h3><span>{blocked.length}人</span></div>
          <div className="card">
            {blocked.map((b) => (
              <div className="req" key={b.userId}>
                <Avatar userId={b.userId} name={b.displayName} off />
                <div className="fbody"><div className="fname">{b.displayName}</div><div className="fmeta">お互いの在校が見えません</div></div>
                <div className="req-actions"><button className="mini-btn" onClick={() => void unblock(b.userId, b.displayName)}>解除</button></div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="footnote">ブロックしても、フレンドからは消えません。解除すると元のフレンドに戻ります。</p>
    </>
  );
}
