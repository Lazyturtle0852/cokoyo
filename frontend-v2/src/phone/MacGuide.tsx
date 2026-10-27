// MACアドレスの調べ方
//
// 最初の登録（src/phone/Onboarding.tsx）と、あとから端末を足すとき（src/phone/Settings.tsx）で使う。
//
// 端末の種類（iPhone / Android / Mac / Windows）と、いまキャンパスにいるかどうかで
// 手順が変わる。キャンパスの外でも、一度でもそのネットワークにつないだことがあれば、
// 保存されたネットワークの設定から同じ値を見られる（つないだことが無ければ見られない。
// どのOSも、ネットワークごとに別のアドレスを作るため）。
//
// 同じ端末でも keiomobile2・eduroam・CNS でアドレスが違うので、
// ふだんつなぐネットワークごとに1つずつ登録してもらう。
//
// キャンパスのWiFiをまだ使っていない人もいるので、つなぎ方のタブも置く（2026-10-23）。
// 手順は湘南藤沢ITC（KIC）の案内をもとに短くまとめ、くわしくは公式のページに案内する。
// keiomobile2 と eduroam は、同じ Wi-Fi ユーザー名・パスワードで、ネットワーク名が違うだけ。

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
      <>キャンパスのWiFi（keiomobile2・eduroam・CNS のどれか）につなぐ</>,
      <><b>設定</b>アプリを開き、<b>Wi-Fi</b>をタップ</>,
      <>つながっているネットワーク名の右にある <b>ⓘ</b> をタップ</>,
      <><b>プライベートWi-Fiアドレス</b>が「ローテーション」なら「<b>固定</b>」にする</>,
      <><b>Wi-Fiアドレス</b>を長押しして<b>コピー</b></>,
      <>このアプリに戻って、下の欄に貼り付ける</>,
    ],
    away: [
      <><b>設定</b>アプリを開き、<b>Wi-Fi</b>をタップ</>,
      <>右上の<b>「編集」</b>を押す（前につないだネットワークの一覧が出る）</>,
      <>登録したいネットワーク（<b>keiomobile2</b>・<b>eduroam</b>・<b>CNS</b>）の右の <b>ⓘ</b> をタップ</>,
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
      <>キャンパスのWiFi（keiomobile2・eduroam・CNS のどれか）につなぐ</>,
      <><b>設定</b>アプリ →「<b>ネットワークとインターネット</b>」→「<b>インターネット</b>」（機種によっては「Wi-Fi」）</>,
      <>つながっているネットワークの <b>歯車</b> をタップ</>,
      <><b>プライバシー</b>は「ランダムMACを使用」のままでOK（このネットワークでは同じ値が使われます）</>,
      <><b>詳細設定</b>を開き、<b>MACアドレス</b>の値を確認する</>,
      <>このアプリに戻って、下の欄に入力する（コピーできない機種は手で入力）</>,
    ],
    away: [
      <><b>設定</b>アプリ →「<b>ネットワークとインターネット</b>」→「<b>インターネット</b>」</>,
      <>下のほうの<b>「保存済みネットワーク」</b>を開く</>,
      <>登録したいネットワーク（<b>keiomobile2</b>・<b>eduroam</b>・<b>CNS</b>）を選び、<b>詳細設定</b>を開く</>,
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
      <>キャンパスのWiFi（keiomobile2・eduroam・CNS のどれか）につなぐ（<b>有線LANではなくWiFi</b>）</>,
      <>アップルメニュー  →「<b>システム設定</b>」→「<b>Wi-Fi</b>」</>,
      <>つながっているネットワークの右の「<b>詳細…</b>」をクリック</>,
      <><b>プライベートWi-Fiアドレス</b>が「ローテーション」なら「<b>固定</b>」にする</>,
      <><b>Wi-Fiアドレス</b>の値をコピー</>,
      <>このページに戻って、下の欄に貼り付ける</>,
    ],
    away: [
      <>「<b>システム設定</b>」→「<b>Wi-Fi</b>」を開く</>,
      <>下のほうの「<b>詳細…</b>」をクリック（前につないだネットワークの一覧が出る）</>,
      <>登録したいネットワーク（<b>keiomobile2</b>・<b>eduroam</b>・<b>CNS</b>）の右の「<b>⋯</b>」→「<b>このネットワークの詳細</b>」をクリック</>,
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
      <>キャンパスのWiFi（keiomobile2・eduroam・CNS のどれか）につなぐ（<b>有線LANではなくWiFi</b>）</>,
      <><b>設定</b>→「<b>ネットワークとインターネット</b>」→「<b>Wi-Fi</b>」</>,
      <>つながっているネットワーク名（「<b>…のプロパティ</b>」）をクリック</>,
      <><b>ランダムなハードウェアアドレス</b>が「毎日変更する」なら「<b>オン</b>」にする（値が固定されます）</>,
      <>下のほうの「<b>物理アドレス (MAC)</b>」の値をコピー</>,
      <>このページに戻って、下の欄に貼り付ける</>,
    ],
    away: [
      <><b>設定</b>→「<b>ネットワークとインターネット</b>」→「<b>Wi-Fi</b>」</>,
      <>「<b>既知のネットワークの管理</b>」を開く</>,
      <>登録したいネットワーク（<b>keiomobile2</b>・<b>eduroam</b>・<b>CNS</b>）を選び、<b>ランダムなハードウェアアドレス</b>を「<b>オン</b>」にする</>,
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

const KIC = 'https://www.sfc.itc.keio.ac.jp/ja/';
const ext = (href: string, text: string) => <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;

/** keiomobile2 のつなぎ方（Wi-Fiユーザー名とパスワードを発行したあと、キャンパスで） */
const CONNECT: Record<Os, { steps: ReactNode[]; page: string }> = {
  ios: {
    steps: [
      <><b>設定</b>アプリ → <b>Wi-Fi</b> → 一覧のいちばん下の「<b>その他…</b>」</>,
      <>名前に <b>keiomobile2</b> と入れ、セキュリティは「<b>WPA2エンタープライズ</b>」</>,
      <>ユーザー名に<b>Wi-Fiユーザー名</b>、パスワードに<b>Wi-Fiパスワード</b>を入れて「<b>接続</b>」</>,
      <>「証明書」が出たら、数秒待ってから「<b>信頼</b>」を<b>1回だけ</b>押す</>,
    ],
    page: `${KIC}net_connect_keiomobile2_peap_ios.html`,
  },
  android: {
    steps: [
      <><b>設定</b> →「<b>ネットワークとインターネット</b>」→「<b>インターネット</b>」（機種によっては「Wi-Fi」）→ <b>keiomobile2</b> を選ぶ</>,
      <>EAP方式「<b>PEAP</b>」、フェーズ2認証「<b>MSCHAPV2</b>」、CA証明書「<b>Security Communication RootCA2</b>」（一覧に無いときは、くわしい手順の「ルート証明書のダウンロード」を先に）</>,
      <>ドメインに <b className="mono">wrcore2.itc.keio.ac.jp</b>、IDに<b>Wi-Fiユーザー名</b>、匿名IDは<b>空欄</b></>,
      <>パスワードに<b>Wi-Fiパスワード</b>を入れて「<b>接続</b>」</>,
    ],
    page: `${KIC}net_connect_keiomobile2_peap_and11.html`,
  },
  mac: {
    steps: [
      <>Wi-Fiの一覧から <b>keiomobile2</b> を選ぶ</>,
      <>ユーザー名に<b>Wi-Fiユーザー名</b>、パスワードに<b>Wi-Fiパスワード</b>を入れる</>,
      <>証明書の確認が出たら、くわしい手順に沿って進める</>,
    ],
    page: `${KIC}net_connect_keiomobile2_peap_mac.html`,
  },
  windows: {
    steps: [
      <>Wi-Fiの一覧から <b>keiomobile2</b> を選ぶ</>,
      <>ユーザー名に<b>Wi-Fiユーザー名</b>、パスワードに<b>Wi-Fiパスワード</b>を入れる</>,
      <>証明書の確認が出たら、くわしい手順に沿って進める</>,
    ],
    page: `${KIC}net_connect_keiomobile2_peap_win11_2.html`,
  },
};

/** キャンパスのWiFiをまだ使っていない人向け：つなぐまで。つながったら「キャンパスにいる」へ */
function WifiSetup({ os, onDone }: { os: Os; onDone(): void }) {
  const c = CONNECT[os];
  return (
    <div className="wifi-setup">
      <p className="row-note">
        キャンパスのWiFiは、<b>慶應のアカウント（keio.jp）で無料</b>で使えます。
        いちばん始めやすいのは <b>keiomobile2</b> です。
      </p>
      <h4 className="ws-h">1. Wi-Fiのユーザー名とパスワードをもらう</h4>
      <p className="row-note">キャンパスの外でもできます。</p>
      <ol className="steps">
        <li><span><b>keio.jp</b> にログインする</span></li>
        <li><span>「<b>Wi-Fi利用登録</b>」を開く（スマホはメニューのアイコンから、パソコンは「Apps」→「keio.jp関連設定」から）</span></li>
        <li><span>「<b>利用を開始する</b>」を押す</span></li>
        <li><span>出てきた<b>Wi-Fiユーザー名</b>と<b>Wi-Fiパスワード</b>を控える</span></li>
      </ol>
      <p className="row-note">{ext(`${KIC}net_connect_keiomobile2_peap_init_keiojp.html`, 'くわしい手順（湘南藤沢ITC）')}</p>

      <h4 className="ws-h">2. キャンパスで keiomobile2 につなぐ（{GUIDE[os].label}）</h4>
      <p className="row-note">keiomobile2 の設定は、キャンパスの中でだけできます。</p>
      <ol className="steps">{c.steps.map((item, i) => <li key={i}><span>{item}</span></li>)}</ol>
      <p className="row-note">{ext(c.page, `くわしい手順（湘南藤沢ITC・${GUIDE[os].label}）`)}</p>

      <h4 className="ws-h">3. つながったら、MACアドレスを登録</h4>
      <button className="btn btn-quiet" onClick={onDone}>「キャンパスにいる」の手順を見る</button>

      <details className="manual ws-more">
        <summary>eduroam・CNS でつなぎたいとき</summary>
        <p className="row-note">
          <b>eduroam</b>：1でもらった同じユーザー名とパスワードを使い、2の手順のネットワーク名を <b>eduroam</b> に読みかえてつなぎます（湘南藤沢ITCの手順は keiomobile2 と eduroam で共通です）。
          {ext(`${KIC}net_connect_eduroam.html`, 'eduroamについて（湘南藤沢ITC）')}
        </p>
        <p className="row-note">
          <b>CNS</b>：SFCのCNSアカウントと、CNSの無線LANパスワードでつなぎます。
          {ext('https://secure.itc.keio.ac.jp/c/a/sfc/ja/network_information_wireless_peap.html', 'CNSの手順（湘南藤沢ITC）')}
        </p>
        <p className="row-note">COKOYOは、どれにつないでいても判定できます。ふだん使うものを1つ選べば十分です。</p>
      </details>
      <p className="row-note muted">
        手順は湘南藤沢ITCの案内をもとにまとめています。画面が違うときは、くわしい手順のページを見てください。
        COKOYOは大学の公式サービスではありません。WiFiの設定で困ったときは湘南藤沢ITCへ、COKOYOのことは「設定 → ご意見・問い合わせ」へお願いします。
      </p>
    </div>
  );
}

const OS_LIST = Object.keys(GUIDE) as Os[];
type Where = 'here' | 'away' | 'setup';

/** 端末の種類から、最初に入れておく端末の名前 */
export const deviceLabel = (os: Os) => GUIDE[os].label;

/**
 * 端末の種類と居場所を選ぶと、その手順を出す。
 * onOs は、選ばれた端末の種類（登録する端末の名前の初期値に使う）。
 */
export function MacGuide({ onOs }: { onOs?: (os: Os) => void }) {
  const [os, setOs] = useState<Os>('ios');
  const [where, setWhere] = useState<Where>('here');
  const away = where === 'away';
  const guide = GUIDE[os];
  const tab = (w: Where, label: string) => (
    <button role="tab" className={where === w ? 'on' : ''} aria-selected={where === w} onClick={() => setWhere(w)}>{label}</button>
  );

  return (
    <>
      <div className="seg four" role="tablist" aria-label="端末の種類">
        {OS_LIST.map((o) => (
          <button key={o} role="tab" className={os === o ? 'on' : ''} aria-selected={os === o}
            onClick={() => { setOs(o); onOs?.(o); }}>{GUIDE[o].label}</button>
        ))}
      </div>
      <div className="seg" role="tablist" aria-label="いまいる場所">
        {tab('here', 'いまキャンパスにいる')}
        {tab('away', 'キャンパスの外にいる')}
      </div>
      <button className={`ws-toggle${where === 'setup' ? ' on' : ''}`} aria-expanded={where === 'setup'}
        onClick={() => setWhere(where === 'setup' ? 'here' : 'setup')}>
        <b>キャンパスのWiFiを使っていない方へ</b>
        <span>{where === 'setup' ? '閉じる' : 'つなぎ方を見る ›'}</span>
      </button>

      {where === 'setup' ? <WifiSetup os={os} onDone={() => setWhere('here')} /> : <>

      <p className="row-note">
        <b>同じ端末でも、keiomobile2・eduroam・CNS でアドレスが違います。</b>
        ふだんつなぐネットワークごとに1つずつ登録してください（最大5個）。
        端末の名前を「iPhone（eduroam）」のようにしておくと見分けやすくなります。
      </p>

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
      </>}
    </>
  );
}
