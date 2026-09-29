// 画面右の「バックエンドのDBの中身」。アプリ本体ではない（説明用のページだけで出す）
//
// 全員ぶんの行を出す。メール・認証情報・MAC原文・共有キーは伏せてある。
// 取りに行くのは GET /v1/debug/db（管理用パスワードで入っていないと 401）。
// この通信は「バックエンドとの通信」には記録しない。

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { api } from '../api/client';
import type { DbTable } from '../api/types';
import { useMockBackend } from '../config';

export function DbPanel() {
  const { view, me, lastCheck, friends, points } = useApp();
  const [tables, setTables] = useState<DbTable[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (useMockBackend) return;
    try {
      setTables((await api.debugDb()).tables);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // 画面が動いたら取り直す（在校確認やフレンド操作でDBが変わるので）
  useEffect(() => { void load(); }, [load, view, me, lastCheck, friends, points]);

  if (useMockBackend) {
    return (
      <section className="panel">
        <h2>バックエンドのDBの中身</h2>
        <p className="desc">このページは模擬バックエンドなので、DBはありません。</p>
        <p className="empty">
          本物のDBの中身は <span className="mono">/explain</span> で見られます（実データ。管理用パスワードが必要）。
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>バックエンドのDBの中身</h2>
      <p className="desc">
        バックエンドの SQLite を、テーブルごと・全員ぶん、行の形で示します。
        メールアドレス、Google の識別子、認証情報、MAC アドレス、共有キーは伏せています。
      </p>

      {error && <p className="empty">読めませんでした：{error}</p>}
      {!error && !tables && <p className="empty">読み込み中…</p>}

      {tables && <DbTables tables={tables} />}

      <div className="callout">
        アプリはこの表を直接は見ません。見えるのは
        <span className="mono">GET /v1/me</span> や <span className="mono">POST /v1/checks</span> が返す形に
        直したものだけです（上の「バックエンドとの通信」）。
      </div>
    </section>
  );
}

/** DBの表を、テーブルごとにそのまま並べる。管理画面（/admin）でも使う。 */
export function DbTables({ tables }: { tables: DbTable[] }) {
  return (
    <>
      {tables.map((t) => (
        <div className="dbt" key={t.name}>
          <p className="plabel first">
            <span className="mono">{t.name}</span>
            <span className="dbt-count">{t.rows.length}行</span>
          </p>
          <p className="dbt-note">{t.note}</p>
          <div className="simwrap">
            <table className="sim dbt-table">
              <thead><tr>{t.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {t.rows.length === 0 && (
                  <tr><td colSpan={t.columns.length} className="muted">（まだ無し）</td></tr>
                )}
                {t.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className={typeof cell === 'number' ? 'num' : undefined}>
                        {cell === null ? <span className="muted">NULL</span> : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
