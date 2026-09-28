import { useState } from 'react';
import { howToOpen, inAppBrowser, inAppName, openInBrowserUrl } from '../app/browser';
import { pendingInvite } from '../app/invite';

/** Google ログイン前に、アプリ内ブラウザから通常のブラウザへ案内する。 */
export function InAppNotice() {
  const [copied, setCopied] = useState(false);
  const kind = inAppBrowser();
  if (!kind) return null;

  const url = new URL(window.location.href);
  const invite = pendingInvite();
  if (invite) url.searchParams.set('add', invite);
  const link = url.toString();
  const intent = openInBrowserUrl(link);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setCopied(false); }
  };

  return (
    <div className="inapp">
      <p className="inapp-title">{inAppName(kind)}の中のブラウザで開いています</p>
      <p className="inapp-body">Googleログインは、ふだん使っているブラウザで開いてから進めてください。</p>
      <p className="inapp-body"><b>{howToOpen(kind)}</b></p>
      {intent
        ? <button className="btn btn-primary" onClick={() => { window.location.href = intent; }}>Chromeで開く</button>
        : <button className="btn btn-quiet" onClick={() => void copy()}>{copied ? 'コピーしました' : 'このページのリンクをコピー'}</button>}
    </div>
  );
}
