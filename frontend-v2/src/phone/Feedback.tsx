// 問い合わせ・ご意見（設定タブ）
//
// アプリの中で書いて、そのまま送れるようにしておく。
// 送り先はCOKOYOのバックエンドで、DBに貯まるだけ（読み方は backend/README.md）。
// メールアプリに飛ばすと、そこで書くのをやめてしまう人が多いため。

import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { api } from '../api/client';

const MAX = 1000;

export function Feedback() {
  const { run, showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const send = async () => {
    const ok = await run('ご意見を送る', async () => {
      const r = await api.sendFeedback(message.trim());
      setSent(true);
      setMessage('');
      showToast(r.remaining > 0 ? '送りました。ありがとうございます' : '送りました。今日はここまでです');
    });
    if (ok) setOpen(false);
  };

  if (sent && !open) {
    return (
      <>
        <p className="row-note">送ってくれてありがとうございます。返事はできませんが、全部読んでいます。</p>
        <button className="btn btn-quiet" onClick={() => { setSent(false); setOpen(true); }}>もう一度送る</button>
      </>
    );
  }

  if (!open) {
    return (
      <>
        <p className="row-note">
          使いにくいところ、動かないところ、ほしい機能があれば教えてください。作っている学生に直接届きます。
        </p>
        <button className="btn btn-quiet" onClick={() => setOpen(true)}>ご意見・不具合を送る</button>
      </>
    );
  }

  return (
    <>
      <label className="field-label" htmlFor="fb">ご意見・不具合</label>
      <textarea className="field fb-text" id="fb" rows={5} maxLength={MAX} autoFocus value={message}
        placeholder="例）フレンドの追加でQRが読み取れませんでした（iPhone 15・Safari）"
        onChange={(e) => setMessage(e.target.value)} />
      <p className="row-note fb-count">{message.length} / {MAX}</p>
      <p className="row-note">
        名前とGoogleアカウントは<b>付きません</b>（誰が送ったかは分かる形で保存されますが、返事はできません）。
        連絡がほしいときは、本文にメールアドレスを書いてください。
      </p>
      <div className="inline-actions">
        <button className="mini-btn primary" disabled={message.trim().length < 2} onClick={() => void send()}>送る</button>
        <button className="mini-btn" onClick={() => setOpen(false)}>やめる</button>
      </div>
    </>
  );
}
