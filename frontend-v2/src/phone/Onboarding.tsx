// はじめての登録（ようこそ → 表示名 → MACアドレス → 完了）と、MACアドレスの登録し直し

import { useState, type ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import { api, callLog, device, type ApiError } from '../api/client';
import { useMockBackend } from '../config';
import { Icon } from './ui';

type Step = 'welcome' | 'name' | 'mac' | 'done';
type Os = 'ios' | 'android';

const IOS_STEPS: ReactNode[] = [
  <>キャンパスのWiFi（keiomobile2 など）につなぐ</>,
  <><b>設定</b>アプリを開き、<b>Wi-Fi</b>をタップ</>,
  <>つながっているネットワーク名の右にある <b>ⓘ</b> をタップ</>,
  <><b>プライベートWi-Fiアドレス</b>が「ローテーション」なら「<b>固定</b>」にする</>,
  <><b>Wi-Fiアドレス</b>を長押しして<b>コピー</b></>,
  <>このアプリに戻って、下の欄に貼り付ける</>,
];
const ANDROID_STEPS: ReactNode[] = [
  <>キャンパスのWiFi（keiomobile2 など）につなぐ</>,
  <><b>設定</b>アプリ →「<b>ネットワークとインターネット</b>」→「<b>インターネット</b>」（機種によっては「Wi-Fi」）</>,
  <>つながっているネットワークの <b>歯車</b> をタップ</>,
  <><b>プライバシー</b>は「ランダムMACを使用」のままでOK（このネットワークでは同じ値が使われます）</>,
  <><b>詳細設定</b>を開き、<b>MACアドレス</b>の値を確認する</>,
  <>このアプリに戻って、下の欄に入力する（コピーできない機種は手で入力）</>,
];

const normalizeMac = (s: string) => s.trim().toLowerCase().replace(/-/g, ':');
const validMac = (s: string) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(s);

export function Onboarding() {
  const { onboardingMode, cancelReregister, completeRegistration, finishOnboarding, setMe, showToast, setTab } = useApp();
  const reRegister = onboardingMode === 'reregister';
  const [step, setStep] = useState<Step>(reRegister ? 'mac' : 'welcome');
  const [name, setName] = useState('');
  const [mac, setMac] = useState('');
  const [os, setOs] = useState<Os>('ios');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const go = (s: Step) => { setError(''); setStep(s); };
  const Back = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button className="ob-back" onClick={onClick}><Icon.Back />{label}</button>
  );

  const paste = async () => {
    try { setMac((await navigator.clipboard.readText()).trim()); setError(''); }
    catch { setError('貼り付けできませんでした。欄を長押しして貼り付けてください'); }
  };

  const fillSample = () => {
    const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    setMac(['5e', hex(), hex(), hex(), hex(), hex()].join(':'));
    setError('');
  };

  const submit = async () => {
    const m = normalizeMac(mac);
    if (!validMac(m)) {
      setError(m ? '形が正しくありません。「a2:3f:9c:1b:7e:44」のように、2文字ずつ「:」で区切った12文字です' : 'MACアドレスを入力してください');
      return;
    }
    if (m === '02:00:00:00:00:00') { setError('この値はスマホが隠しているときの仮の値です。設定アプリの値を写してください'); return; }
    setBusy(true); setError('');
    callLog.begin(reRegister ? 'MACアドレスを登録し直す' : 'はじめての登録');
    try {
      if (reRegister) {
        setMe(await api.updateMac(m));
        setTab('settings');
        cancelReregister();
        showToast('MACアドレスを登録し直しました');
      } else {
        const r = await api.register(name.trim(), m);
        device.set(r.deviceToken);
        await completeRegistration();
        setStep('done');
      }
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'welcome') {
    return (
      <div className="content ob">
        <div className="ob-hero">
          <div className="wordmark big">COK<span>O</span>YO</div>
          <span className="provisional">仮称</span>
          <h2>フレンドがキャンパスにいるか、<br />ボタンひとつで分かる</h2>
        </div>
        <ul className="ob-list">
          <li><span className="ob-ico"><Icon.Wifi /></span><span><b>位置情報は使いません</b>キャンパスのWiFiにつながっているかだけを見ます</span></li>
          <li><span className="ob-ico best"><Icon.Friends size={18} /></span><span><b>見せる範囲は相手ごと</b>ベストフレンドにだけ建物まで。ブロックした相手には見えません</span></li>
          <li><span className="ob-ico hide"><Icon.Hide /></span><span><b>いつでも隠れられます</b>かくれんぼ中は、フレンド全員から「いません」に見えます</span></li>
        </ul>
        <button className="btn btn-primary" onClick={() => go('name')}>はじめる</button>
      </div>
    );
  }

  if (step === 'name') {
    return (
      <div className="content ob">
        <Back onClick={() => go('welcome')} label="戻る" />
        <p className="ob-step">1 / 2</p>
        <h2 className="ob-title">フレンドに表示される名前</h2>
        <p className="ob-lead">あとから設定で変えられます。</p>
        <label className="field-label" htmlFor="obName">表示名</label>
        <input className="field" id="obName" maxLength={20} placeholder="例）ゆうき" value={name} autoComplete="nickname" autoFocus
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) go('mac'); }} />
        <button className="btn btn-primary" onClick={() => go('mac')} disabled={!name.trim()}>次へ</button>
      </div>
    );
  }

  if (step === 'mac') {
    const steps = os === 'ios' ? IOS_STEPS : ANDROID_STEPS;
    return (
      <div className="content ob">
        {reRegister ? <Back onClick={cancelReregister} label="設定に戻る" /> : <Back onClick={() => go('name')} label="戻る" />}
        {!reRegister && <p className="ob-step">2 / 2</p>}
        <h2 className="ob-title">{reRegister ? 'MACアドレスを登録し直す' : 'キャンパスのWiFiのMACアドレスを登録'}</h2>
        <p className="ob-lead">スマホの識別番号です。これで「キャンパスにいるか」を判定します。フレンドには見せません。</p>

        <div className="seg" role="tablist" aria-label="スマホの種類">
          {(['ios', 'android'] as Os[]).map((o) => (
            <button key={o} role="tab" className={os === o ? 'on' : ''} aria-selected={os === o} onClick={() => setOs(o)}>
              {o === 'ios' ? 'iPhone' : 'Android'}
            </button>
          ))}
        </div>

        <ol className="steps">{steps.map((s, i) => <li key={i}><span>{s}</span></li>)}</ol>

        {os === 'ios' ? (
          <div className="sm">
            <div className="sm-cap">設定 › Wi-Fi › keiomobile2 ⓘ</div>
            <div className="sm-row"><span>プライベートWi-Fiアドレス</span><span className="sm-val">固定 ›</span></div>
            <div className="sm-row hl"><span>Wi-Fiアドレス</span><span className="sm-val mono">A2:3F:9C:1B:7E:44</span></div>
          </div>
        ) : (
          <>
            <div className="sm">
              <div className="sm-cap">ネットワークの詳細 › 詳細設定</div>
              <div className="sm-row"><span>プライバシー</span><span className="sm-val">ランダムMACを使用</span></div>
              <div className="sm-row hl"><span>MACアドレス</span><span className="sm-val mono">a2:3f:9c:1b:7e:44</span></div>
            </div>
            <p className="row-note">機種によって項目の名前や場所が違います。</p>
          </>
        )}

        <label className="field-label" htmlFor="obMac">MACアドレス</label>
        <div className="field-row">
          <input className="field mono" id="obMac" placeholder="例）a2:3f:9c:1b:7e:44" value={mac}
            autoComplete="off" autoCapitalize="off" spellCheck={false} aria-describedby="obMacErr"
            onChange={(e) => setMac(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
          <button className="mini-btn" onClick={() => void paste()}>貼り付け</button>
        </div>
        <p className="field-err" id="obMacErr" role="alert">{error}</p>
        {useMockBackend && <button className="demo-link" onClick={fillSample}>（デモ）例のアドレスを入れる</button>}

        <div className="notice">
          <p><b>キャンパスではWiFiをオンに。</b>モバイルデータだけだと検知できません。</p>
          <p className="muted">本人確認の仕組みができるまでの暫定の登録方法です。</p>
        </div>

        <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? '登録しています…' : reRegister ? '登録し直す' : '登録する'}
        </button>
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
