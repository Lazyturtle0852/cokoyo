// 知り合いかも（フレンドタブ）
//
// 出すのは、フレンドのフレンドのうち
//   ・ベストフレンドのフレンド
//   ・共通のフレンドが2人以上
// の人だけ。画面には、どちらの理由かは出さず、共通のフレンドの名前だけを出す
// （申請するかどうかを決められるのは、そこなので）。
// 「出さない」を押した相手は、この端末では二度と出さない。

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { api } from '../api/client';
import type { Suggestion } from '../api/types';
import { Avatar } from './ui';

/** 「出さない」を押した相手（この端末の中だけ） */
const HIDDEN_KEY = 'cokoyo-suggest-hidden:v1';
const readHidden = (): string[] => {
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as string[]; } catch { return []; }
};
const addHidden = (userId: string) => {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...new Set([...readHidden(), userId])].slice(-200))); }
  catch { /* 保存できない環境 */ }
};

/** 「佐藤さん・田中さんのフレンド」。多いときは3人まで出して「ほか」でとめる */
function mutualLine(s: Suggestion): string {
  const names = s.mutual.map((u) => `${u.displayName}さん`);
  const head = names.slice(0, 3).join('・');
  return names.length > 3 ? `${head}ほかのフレンド` : `${head}のフレンド`;
}

export function Suggestions() {
  const { friends, run, reloadFriends, showToast } = useApp();
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [hidden, setHidden] = useState<string[]>(readHidden);

  // フレンドが増えたり減ったりすると顔ぶれが変わるので、そのたびに取り直す
  const load = useCallback(() => {
    api.getSuggestions(true).then((r) => setList(r.suggestions)).catch(() => setList([]));
  }, []);
  useEffect(load, [load, friends?.friends.length]);

  const shown = (list ?? []).filter((s) => !hidden.includes(s.userId));
  if (!shown.length) return null;

  const request = (s: Suggestion) => run('知り合いかもから申請', async () => {
    await api.addFriendById(s.userId);
    await reloadFriends();
    setList((prev) => (prev ?? []).filter((x) => x.userId !== s.userId));
    showToast(`${s.displayName}さんに申請しました。相手が承認するとフレンドになります`);
  });

  const dismiss = (s: Suggestion) => {
    addHidden(s.userId);
    setHidden(readHidden());
  };

  return (
    <>
      <div className="sec"><h3>知り合いかも</h3><span>{shown.length}人</span></div>
      <div className="card">
        {shown.map((s) => (
          <div className="req" key={s.userId}>
            <Avatar userId={s.userId} name={s.displayName} avatar={s.avatar} off />
            <div className="fbody">
              <div className="fname">{s.displayName}</div>
              <div className="fmeta">{mutualLine(s)}</div>
            </div>
            <div className="req-actions">
              <button className="mini-btn primary" onClick={() => void request(s)}>申請</button>
              <button className="mini-btn" onClick={() => dismiss(s)}>出さない</button>
            </div>
          </div>
        ))}
        <p className="row-note">
          共通のフレンドがいる人を出しています。相手には、あなたがここを見たことは伝わりません。
          自分を出したくないときは、設定タブの「知り合いかもに出す」をオフにしてください。
        </p>
      </div>
    </>
  );
}
