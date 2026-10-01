// はじめての登録（ようこそ → 表示名 → MACアドレス → 完了）と、MACアドレスの登録し直し

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useInstall } from '../app/install';
import { pendingInvite } from '../app/invite';
import { api, callLog, type ApiError } from '../api/client';
import { useMockBackend } from '../config';
import { InstallStep } from './Install';
import { deviceLabel, MacGuide, type Os } from './MacGuide';
import { Icon } from './ui';

type Step = 'install' | 'name' | 'mac' | 'done';

const normalizeMac = (s: string) => s.trim().toLowerCase().replace(/-/g, ':');
const validMac = (s: string) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(s);

export function Onboarding() {
  const { completeRegistration, finishOnboarding, initialDisplayName } = useApp();
  const { canOffer } = useInstall();
  const [step, setStep] = useState<Step>(canOffer ? 'install' : 'name');
  const [name, setName] = useState(initialDisplayName);
  const [mac, setMac] = useState('');
  const [label, setLabel] = useState(deviceLabel('ios'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [step]);
  const go = (next: Step) => { setError(''); setStep(next); };

  const submit = async () => {
    const normalized = normalizeMac(mac);
    if (!validMac(normalized) || normalized === '02:00:00:00:00:00') {
      setError('キャンパスのWiFi設定に表示されたMACアドレスを入力してください');
      return;
    }
    if (!label.trim() || label.trim().length > 30) { setError('端末の名前は1〜30文字で入力してください'); return; }
    setBusy(true); setError('');
    callLog.begin('初回登録');
    try {
      await api.completeOnboarding(name.trim(), normalized, label.trim());
      await completeRegistration();
      setStep('done');
    } catch (e) { setError((e as ApiError).message); }
    finally { setBusy(false); }
  };

  if (step === 'install') return <InstallStep onNext={() => go('name')} />;
  if (step === 'name') return (
    <div className="content ob" ref={contentRef}>
      <p className="ob-step">1 / 2</p>
      <h2 className="ob-title">フレンドに表示される名前</h2>
      <p className="ob-lead">あとから設定で変えられます。</p>
      {pendingInvite() && <p className="row-note">登録が終わったら、招待してくれた人にフレンド申請するかを確かめます。</p>}
      <label className="field-label" htmlFor="obName">表示名</label>
      <input className="field" id="obName" maxLength={20} placeholder="例）ゆうき" value={name} autoComplete="nickname" autoFocus
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) go('mac'); }} />
      <button className="btn btn-primary" onClick={() => go('mac')} disabled={!name.trim()}>次へ</button>
    </div>
  );
  if (step === 'mac') {
    return (
      <div className="content ob" ref={contentRef}>
        <button className="ob-back" onClick={() => go('name')}><Icon.Back />戻る</button>
        <p className="ob-step">2 / 2</p>
        <h2 className="ob-title">最初の端末を登録</h2>
        <p className="ob-lead">キャンパスのWiFiで使うMACアドレスを入力してください。あとから最大5台まで追加できます。</p>
        <MacGuide onOs={(o: Os) => setLabel(deviceLabel(o))} />
        <label className="field-label" htmlFor="obLabel">端末の名前</label>
        <input className="field" id="obLabel" maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} />
        <label className="field-label" htmlFor="obMac">MACアドレス</label>
        <input className="field mono" id="obMac" placeholder="例）a2:3f:9c:1b:7e:44" value={mac}
          autoComplete="off" autoCapitalize="off" spellCheck={false} aria-describedby="obMacErr"
          onChange={(e) => setMac(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
        <p className="field-err" id="obMacErr" role="alert">{error}</p>
        {useMockBackend && <button className="demo-link" onClick={() => setMac('5e:12:34:56:78:90')}>（デモ）例のアドレスを入れる</button>}
        <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>{busy ? '登録しています…' : '登録する'}</button>
      </div>
    );
  }
  return (
    <div className="content ob ob-done">
      <div className="done-mark"><Icon.Check /></div>
      <h2 className="ob-title">登録しました</h2>
      <p className="ob-lead">キャンパスで「ポイント獲得（在校確認）」を押すと、あなたとフレンドの様子が分かります。</p>
      <button className="btn btn-primary" onClick={() => finishOnboarding('friends')}>フレンドを追加する</button>
      <button className="btn btn-quiet" onClick={() => finishOnboarding('home')}>あとで</button>
    </div>
  );
}
