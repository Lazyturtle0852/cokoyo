// はじめての登録（ようこそ → 表示名 → MACアドレス → 完了）と、MACアドレスの登録し直し

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import { useInstall } from '../app/install';
import { pendingInvite } from '../app/invite';
import { api, callLog, type ApiError } from '../api/client';
import { useMockBackend } from '../config';
import { InstallStep } from './Install';
import { Icon } from './ui';

type Step = 'install' | 'name' | 'mac' | 'done';
type Os = 'ios' | 'android' | 'mac' | 'windows';

/**
 * 端末ごとのMACアドレスの調べ方。
 *
 * スマホだけでなくパソコンからも登録できる。どの端末でも、要るのは
 * 「キャンパスのWiFiにつないでいるアダプタのMACアドレス」1つ。
 * どのOSも既定でネットワークごとにランダム化するので、その値が
 * 変わり続ける設定になっていないかを先に確かめてもらう。
 */
const GUIDE: Record<Os, { label: string; steps: ReactNode[]; sample: ReactNode; note?: string }> = {
  ios: {
    label: 'iPhone',
    steps: [
      <>キャンパスのWiFi（keiomobile2 など）につなぐ</>,
      <><b>設定</b>アプリを開き、<b>Wi-Fi</b>をタップ</>,
      <>つながっているネットワーク名の右にある <b>ⓘ</b> をタップ</>,
      <><b>プライベートWi-Fiアドレス</b>が「ローテーション」なら「<b>固定</b>」にする</>,
      <><b>Wi-Fiアドレス</b>を長押しして<b>コピー</b></>,
      <>このアプリに戻って、下の欄に貼り付ける</>,
    ],
    sample: (
      <div className="sm">
        <div className="sm-cap">設定 › Wi-Fi › keiomobile2 ⓘ</div>
        <div className="sm-row"><span>プライベートWi-Fiアドレス</span><span className="sm-val">固定 ›</span></div>
        <div className="sm-row hl"><span>Wi-Fiアドレス</span><span className="sm-val mono">A2:3F:9C:1B:7E:44</span></div>
      </div>
    ),
  },
  android: {
    label: 'Android',
    steps: [
      <>キャンパスのWiFi（keiomobile2 など）につなぐ</>,
      <><b>設定</b>アプリ →「<b>ネットワークとインターネット</b>」→「<b>インターネット</b>」（機種によっては「Wi-Fi」）</>,
      <>つながっているネットワークの <b>歯車</b> をタップ</>,
      <><b>プライバシー</b>は「ランダムMACを使用」のままでOK（このネットワークでは同じ値が使われます）</>,
      <><b>詳細設定</b>を開き、<b>MACアドレス</b>の値を確認する</>,
      <>このアプリに戻って、下の欄に入力する（コピーできない機種は手で入力）</>,
    ],
    sample: (
      <div className="sm">
        <div className="sm-cap">ネットワークの詳細 › 詳細設定</div>
        <div className="sm-row"><span>プライバシー</span><span className="sm-val">ランダムMACを使用</span></div>
        <div className="sm-row hl"><span>MACアドレス</span><span className="sm-val mono">a2:3f:9c:1b:7e:44</span></div>
      </div>
    ),
    note: '機種によって項目の名前や場所が違います。',
  },
  mac: {
    label: 'Mac',
    steps: [
      <>キャンパスのWiFi（keiomobile2 など）につなぐ（<b>有線LANではなくWiFi</b>）</>,
      <>アップルメニュー  →「<b>システム設定</b>」→「<b>Wi-Fi</b>」</>,
      <>つながっているネットワークの右の「<b>詳細…</b>」をクリック</>,
      <><b>プライベートWi-Fiアドレス</b>が「ローテーション」なら「<b>固定</b>」にする</>,
      <><b>Wi-Fiアドレス</b>の値をコピー</>,
      <>このページに戻って、下の欄に貼り付ける</>,
    ],
    sample: (
      <div className="sm">
        <div className="sm-cap">システム設定 › Wi-Fi › keiomobile2 › 詳細…</div>
        <div className="sm-row"><span>プライベートWi-Fiアドレス</span><span className="sm-val">固定 ›</span></div>
        <div className="sm-row hl"><span>Wi-Fiアドレス</span><span className="sm-val mono">a2:3f:9c:1b:7e:44</span></div>
      </div>
    ),
    note: 'macOS 13 以前は「システム環境設定」→「ネットワーク」→「Wi-Fi」→「詳細」→「ハードウェア」にあります。',
  },
  windows: {
    label: 'Windows',
    steps: [
      <>キャンパスのWiFi（keiomobile2 など）につなぐ（<b>有線LANではなくWiFi</b>）</>,
      <><b>設定</b>→「<b>ネットワークとインターネット</b>」→「<b>Wi-Fi</b>」</>,
      <>つながっているネットワーク名（「<b>…のプロパティ</b>」）をクリック</>,
      <><b>ランダムなハードウェアアドレス</b>が「毎日変更する」なら「<b>オン</b>」にする（値が固定されます）</>,
      <>下のほうの「<b>物理アドレス (MAC)</b>」の値をコピー</>,
      <>このページに戻って、下の欄に貼り付ける</>,
    ],
    sample: (
      <div className="sm">
        <div className="sm-cap">設定 › ネットワークとインターネット › Wi-Fi › keiomobile2 のプロパティ</div>
        <div className="sm-row"><span>ランダムなハードウェアアドレス</span><span className="sm-val">オン</span></div>
        <div className="sm-row hl"><span>物理アドレス (MAC)</span><span className="sm-val mono">A2-3F-9C-1B-7E-44</span></div>
      </div>
    ),
    note: '「-」区切りのまま貼り付けても大丈夫です。',
  },
};

const OS_LIST = Object.keys(GUIDE) as Os[];

const normalizeMac = (s: string) => s.trim().toLowerCase().replace(/-/g, ':');
const validMac = (s: string) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(s);

export function Onboarding() {
  const { completeRegistration, finishOnboarding, initialDisplayName } = useApp();
  const { canOffer } = useInstall();
  const [step, setStep] = useState<Step>(canOffer ? 'install' : 'name');
  const [name, setName] = useState(initialDisplayName);
  const [mac, setMac] = useState('');
  const [os, setOs] = useState<Os>('ios');
  const [label, setLabel] = useState('iPhone');
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
      {pendingInvite() && <p className="row-note">登録後に招待リンクの相手へ申請します。</p>}
      <label className="field-label" htmlFor="obName">表示名</label>
      <input className="field" id="obName" maxLength={20} placeholder="例）ゆうき" value={name} autoComplete="nickname" autoFocus
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) go('mac'); }} />
      <button className="btn btn-primary" onClick={() => go('mac')} disabled={!name.trim()}>次へ</button>
    </div>
  );
  if (step === 'mac') {
    const guide = GUIDE[os];
    return (
      <div className="content ob" ref={contentRef}>
        <button className="ob-back" onClick={() => go('name')}><Icon.Back />戻る</button>
        <p className="ob-step">2 / 2</p>
        <h2 className="ob-title">最初の端末を登録</h2>
        <p className="ob-lead">キャンパスのWiFiで使うMACアドレスを入力してください。あとから最大5台まで追加できます。</p>
        <div className="seg four" role="tablist" aria-label="端末の種類">
          {OS_LIST.map((o) => <button key={o} role="tab" className={os === o ? 'on' : ''} aria-selected={os === o}
            onClick={() => { setOs(o); setLabel(GUIDE[o].label); }}>{GUIDE[o].label}</button>)}
        </div>
        <ol className="steps">{guide.steps.map((item, i) => <li key={i}><span>{item}</span></li>)}</ol>
        {guide.sample}{guide.note && <p className="row-note">{guide.note}</p>}
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
