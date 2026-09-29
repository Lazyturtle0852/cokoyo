// MACアドレスの調べ方
//
// 最初の登録（src/phone/Onboarding.tsx）と、あとから端末を足すとき（src/phone/Settings.tsx）で使う。
//
// 端末の種類（iPhone / Android / Mac / Windows）と、いまキャンパスにいるかどうかで
// 手順が変わる。キャンパスの外でも、一度でも keiomobile2 につないだことがあれば、
// 保存されたネットワークの設定から同じ値を見られる（つないだことが無ければ見られない。
// どのOSも、ネットワークごとに別のアドレスを作るため）。

import { useState, type ReactNode } from 'react';

export type Os = 'ios' | 'android' | 'mac' | 'windows';

interface Guide {
  label: string;
  /** キャンパスのWiFiにつないでいるとき */
  here: ReactNode[];
  /** キャンパスの外にいるとき（前につないだ設定から見る） */
  away: ReactNode[];
  sample: ReactNode;
  note?: string;
  awayNote?: string;
}

export const GUIDE: Record<Os, Guide> = {
  ios: {
    label: 'iPhone',
    here: [
      <>キャンパスのWiFi（keiomobile2 など）につなぐ</>,
      <><b>設定</b>アプリを開き、<b>Wi-Fi</b>をタップ</>,
      <>つながっているネットワーク名の右にある <b>ⓘ</b> をタップ</>,
      <><b>プライベートWi-Fiアドレス</b>が「ローテーション」なら「<b>固定</b>」にする</>,
      <><b>Wi-Fiアドレス</b>を長押しして<b>コピー</b></>,
      <>このアプリに戻って、下の欄に貼り付ける</>,
    ],
    away: [
      <><b>設定</b>アプリを開き、<b>Wi-Fi</b>をタップ</>,
      <>右上の<b>「編集」</b>を押す（前につないだネットワークの一覧が出る）</>,
      <><b>keiomobile2</b> の右の <b>ⓘ</b> をタップ</>,
      <><b>プライベートWi-Fiアドレス</b>が「ローテーション」なら「<b>固定</b>」にする</>,
      <><b>Wi-Fiアドレス</b>を長押しして<b>コピー</b>し、下の欄に貼り付ける</>,
    ],
    sample: (
      <div className="sm">
        <div className="sm-cap">設定 › Wi-Fi › keiomobile2 ⓘ</div>
        <div className="sm-row"><span>プライベートWi-Fiアドレス</span><span className="sm-val">固定 ›</span></div>
        <div className="sm-row hl"><span>Wi-Fiアドレス</span><span className="sm-val mono">A2:3F:9C:1B:7E:44</span></div>
      </div>
    ),
    awayNote: 'iOS 15 以前には「編集」がありません。その場合はキャンパスでつないだときに登録してください。',
  },
  android: {
    label: 'Android',
    here: [
      <>キャンパスのWiFi（keiomobile2 など）につなぐ</>,
      <><b>設定</b>アプリ →「<b>ネットワークとインターネット</b>」→「<b>インターネット</b>」（機種によっては「Wi-Fi」）</>,
      <>つながっているネットワークの <b>歯車</b> をタップ</>,
      <><b>プライバシー</b>は「ランダムMACを使用」のままでOK（このネットワークでは同じ値が使われます）</>,
      <><b>詳細設定</b>を開き、<b>MACアドレス</b>の値を確認する</>,
      <>このアプリに戻って、下の欄に入力する（コピーできない機種は手で入力）</>,
    ],
    away: [
      <><b>設定</b>アプリ →「<b>ネットワークとインターネット</b>」→「<b>インターネット</b>」</>,
      <>下のほうの<b>「保存済みネットワーク」</b>を開く</>,
      <><b>keiomobile2</b> を選び、<b>詳細設定</b>を開く</>,
      <><b>MACアドレス</b>（「ランダムMACアドレス」と書かれていることもあります）の値を、下の欄に入力する</>,
    ],
    sample: (
      <div className="sm">
        <div className="sm-cap">ネットワークの詳細 › 詳細設定</div>
        <div className="sm-row"><span>プライバシー</span><span className="sm-val">ランダムMACを使用</span></div>
        <div className="sm-row hl"><span>MACアドレス</span><span className="sm-val mono">a2:3f:9c:1b:7e:44</span></div>
      </div>
    ),
    note: '機種によって項目の名前や場所が違います。',
    awayNote: '「保存済みネットワーク」が見つからない機種では、キャンパスでつないだときに登録してください。',
  },
  mac: {
    label: 'Mac',
    here: [
      <>キャンパスのWiFi（keiomobile2 など）につなぐ（<b>有線LANではなくWiFi</b>）</>,
      <>アップルメニュー  →「<b>システム設定</b>」→「<b>Wi-Fi</b>」</>,
      <>つながっているネットワークの右の「<b>詳細…</b>」をクリック</>,
      <><b>プライベートWi-Fiアドレス</b>が「ローテーション」なら「<b>固定</b>」にする</>,
      <><b>Wi-Fiアドレス</b>の値をコピー</>,
      <>このページに戻って、下の欄に貼り付ける</>,
    ],
    away: [
      <>「<b>システム設定</b>」→「<b>Wi-Fi</b>」を開く</>,
      <>下のほうの「<b>詳細…</b>」をクリック（前につないだネットワークの一覧が出る）</>,
      <><b>keiomobile2</b> の右の「<b>⋯</b>」→「<b>このネットワークの詳細</b>」をクリック</>,
      <><b>プライベートWi-Fiアドレス</b>を「<b>固定</b>」にして、<b>Wi-Fiアドレス</b>をコピーする</>,
    ],
    sample: (
      <div className="sm">
        <div className="sm-cap">システム設定 › Wi-Fi › keiomobile2 › 詳細…</div>
        <div className="sm-row"><span>プライベートWi-Fiアドレス</span><span className="sm-val">固定 ›</span></div>
        <div className="sm-row hl"><span>Wi-Fiアドレス</span><span className="sm-val mono">a2:3f:9c:1b:7e:44</span></div>
      </div>
    ),
    note: 'macOS 13 以前は「システム環境設定」→「ネットワーク」→「Wi-Fi」→「詳細」→「ハードウェア」にあります。',
    awayNote: 'つないでいないときは、Wi-Fiアドレスが出ないことがあります。出なければキャンパスで登録してください。',
  },
  windows: {
    label: 'Windows',
    here: [
      <>キャンパスのWiFi（keiomobile2 など）につなぐ（<b>有線LANではなくWiFi</b>）</>,
      <><b>設定</b>→「<b>ネットワークとインターネット</b>」→「<b>Wi-Fi</b>」</>,
      <>つながっているネットワーク名（「<b>…のプロパティ</b>」）をクリック</>,
      <><b>ランダムなハードウェアアドレス</b>が「毎日変更する」なら「<b>オン</b>」にする（値が固定されます）</>,
      <>下のほうの「<b>物理アドレス (MAC)</b>」の値をコピー</>,
      <>このページに戻って、下の欄に貼り付ける</>,
    ],
    away: [
      <><b>設定</b>→「<b>ネットワークとインターネット</b>」→「<b>Wi-Fi</b>」</>,
      <>「<b>既知のネットワークの管理</b>」を開く</>,
      <><b>keiomobile2</b> を選び、<b>ランダムなハードウェアアドレス</b>を「<b>オン</b>」にする</>,
      <>「<b>物理アドレス (MAC)</b>」の値を、下の欄に入力する</>,
    ],
    sample: (
      <div className="sm">
        <div className="sm-cap">設定 › ネットワークとインターネット › Wi-Fi › keiomobile2 のプロパティ</div>
        <div className="sm-row"><span>ランダムなハードウェアアドレス</span><span className="sm-val">オン</span></div>
        <div className="sm-row hl"><span>物理アドレス (MAC)</span><span className="sm-val mono">A2-3F-9C-1B-7E-44</span></div>
      </div>
    ),
    note: '「-」区切りのまま貼り付けても大丈夫です。',
    awayNote: '値が出ないときは、キャンパスでつないだときに登録してください。',
  },
};

const OS_LIST = Object.keys(GUIDE) as Os[];

/** 端末の種類から、最初に入れておく端末の名前 */
export const deviceLabel = (os: Os) => GUIDE[os].label;

/**
 * 端末の種類と居場所を選ぶと、その手順を出す。
 * onOs は、選ばれた端末の種類（登録する端末の名前の初期値に使う）。
 */
export function MacGuide({ onOs }: { onOs?: (os: Os) => void }) {
  const [os, setOs] = useState<Os>('ios');
  const [away, setAway] = useState(false);
  const guide = GUIDE[os];

  return (
    <>
      <div className="seg four" role="tablist" aria-label="端末の種類">
        {OS_LIST.map((o) => (
          <button key={o} role="tab" className={os === o ? 'on' : ''} aria-selected={os === o}
            onClick={() => { setOs(o); onOs?.(o); }}>{GUIDE[o].label}</button>
        ))}
      </div>
      <div className="seg" role="tablist" aria-label="いまいる場所">
        <button role="tab" className={away ? '' : 'on'} aria-selected={!away} onClick={() => setAway(false)}>いまキャンパスにいる</button>
        <button role="tab" className={away ? 'on' : ''} aria-selected={away} onClick={() => setAway(true)}>キャンパスの外にいる</button>
      </div>

      {away && (
        <p className="row-note">
          <b>一度でもキャンパスのWiFiにつないだことがあれば</b>、外からでも同じ値を見られます。
          まだ一度もつないでいない端末は、キャンパスでつないでから登録してください
          （どの端末も、ネットワークごとに別のアドレスを作るためです）。
        </p>
      )}

      <ol className="steps">{(away ? guide.away : guide.here).map((item, i) => <li key={i}><span>{item}</span></li>)}</ol>
      {guide.sample}
      {away ? guide.awayNote && <p className="row-note">{guide.awayNote}</p>
        : guide.note && <p className="row-note">{guide.note}</p>}
    </>
  );
}
