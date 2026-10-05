// 見出しを押すと、中身を隠す／見せる（▶ 閉じている・▼ 開いている）
//
// フレンドや知り合いかもが増えると画面が長くなるので、ホームとフレンドタブの見出しに使う。
// 開け閉めはこの端末に覚えておく（次に開いたときも同じ状態）。保存できない環境でも動く。

import { useState, type ReactNode } from 'react';

const STORE = 'cokoyo-sections:v1';

function readAll(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, boolean>; } catch { return {}; }
}

function save(id: string, open: boolean) {
  try { localStorage.setItem(STORE, JSON.stringify({ ...readAll(), [id]: open })); } catch { /* 覚えられないだけ */ }
}

export function Section({ id, title, aside, defaultOpen = true, children }: {
  /** 開け閉めを覚えるための名前。画面ごとに別にする（例 'home.friends'） */
  id: string;
  title: string;
  /** 見出しの右に出す短い文（人数など）。閉じていても見える */
  aside?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readAll()[id] ?? defaultOpen);
  const toggle = () => { setOpen(!open); save(id, !open); };

  return (
    <>
      <div className="sec">
        <button className="sec-toggle" aria-expanded={open} onClick={toggle}>
          <svg className="sec-tri" width="11" height="11" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5 8 5l-5 3.5z" fill="currentColor" /></svg>
          <h3>{title}</h3>
        </button>
        {aside !== undefined && <span>{aside}</span>}
      </div>
      {open && children}
    </>
  );
}
