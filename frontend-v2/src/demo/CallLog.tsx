// 画面右の「バックエンドとの通信」。アプリが送った内容と、返ってきた内容を出す

import { useSyncExternalStore, type ReactNode } from 'react';
import { callLog } from '../api/client';

// JSONに色を付ける
function Json({ value }: { value: unknown }) {
  if (value == null) return <span className="bool">（本文なし）</span>;
  const text = JSON.stringify(value, null, 2);
  const out: ReactNode[] = [];
  const re = /("(?:\\.|[^\\"])*"\s*:)|("(?:\\.|[^\\"])*")|(\b-?\d+(?:\.\d+)?\b)|\b(true|false|null)\b/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const cls = m[1] ? 'key' : m[2] ? 'str' : m[3] ? 'num' : 'bool';
    out.push(<span className={cls} key={m.index}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

export function CallLog() {
  const { actionName, calls } = useSyncExternalStore(callLog.subscribe, callLog.get);
  return (
    <section className="panel">
      <h2>バックエンドとの通信</h2>
      <p className="desc">{actionName ? `直前の操作：${actionName}` : 'アプリがバックエンドとやりとりした内容'}</p>
      <div className="calls">
        {calls.length === 0 && <p className="empty">操作するとここに表示されます</p>}
        {calls.map((c, i) => (
          <div className="call" key={i}>
            <div className="callhead">
              <span className="verb">{c.method}</span><span className="mono">{c.path}</span>
              <span className={`status${c.status >= 400 || c.status === 0 ? ' bad' : ''}`}>{c.status || '接続失敗'}</span>
              <span className="auth">{c.withToken ? '端末トークンつき' : 'トークンなし'}</span>
            </div>
            <div className="io">
              <div><p className="cap">送ったもの</p><pre>{c.body ? <Json value={c.body} /> : '（なし）'}</pre></div>
              <div><p className="cap">返ってきたもの</p><pre><Json value={c.json} /></pre></div>
            </div>
          </div>
        ))}
      </div>
      <div className="callout">
        バックエンドは、ここに出ている<strong>パス・送るもの・返すもの</strong>の形で作ってください。
        一覧は <span className="mono">docs/api-for-backend.md</span>、型は <span className="mono">app/src/api/types.ts</span> にあります。
      </div>
    </section>
  );
}
