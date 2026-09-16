// ホーム上部のキャンパスのフィールドとスライム
//
// 在校確認をすると、キャンパスにいる自分とフレンドのスライムが現れて、跳ねながら動き回る。
// かくれんぼ中の自分は、おばけになってふわふわ漂う。
// タブを切り替えてもアニメーションが途切れないよう、Reactの外で一度だけ作って使い回す
// （置き場所は src/phone/FieldView.tsx）。

export interface FieldFriend {
  userId: string;
  name: string;
}

export interface FieldSelf {
  /** 自分がキャンパスにいるか */
  present: boolean;
  /** かくれんぼ中なら、おばけの姿になる */
  ghost: boolean;
}

export interface CampusField {
  el: HTMLDivElement;
  /** キャンパスにいる自分とフレンドに合わせてスライムを出し入れする。着地までのミリ秒を返す */
  sync(friends: FieldFriend[], self: FieldSelf): number;
  /** 自分のスライムを、おばけに変える／戻す（自分のスライムがいるときだけ） */
  setGhost(ghost: boolean): void;
  /** そのスライムの頭上に文字を出す。スライムがいなければ false */
  pop(userId: string, text: string): boolean;
  clear(): void;
}

// フィールドの座標（SVGの viewBox と同じ単位）
const VW = 368;
const VH = 200;
const LAWN = { cx: 184, cy: 150, rx: 190, ry: 44 };
const POND = { cx: 70, cy: 166, rx: 62, ry: 24 };

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// ---------------------------------------------------------------
// 背景：SFCのキャンパスを平面的にしたもの
// ---------------------------------------------------------------
const mullions = (x0: number, x1: number, step: number, y: number, h: number, fill: string) => {
  let s = '';
  for (let x = x0 + step; x < x1; x += step) s += `<rect x="${x}" y="${y}" width="2" height="${h}" fill="${fill}"/>`;
  return s;
};
const grid = (xs: number[], ys: number[], w: number, h: number, fill: string) =>
  xs.map((x) => ys.map((y) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${fill}"/>`).join('')).join('');
const tree = (x: number, y: number, r: number) => `<rect x="${x - 1.5}" y="${y}" width="3" height="${r + 6}" fill="#8A6B4E"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="#63B452"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.45}" fill="#7FC76A"/>`;

const SCENE = `<svg class="scene" viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false">
  ${tree(20, 94, 15)}${tree(348, 92, 16)}
  <!-- 左：窓の帯が横に走る研究棟（ピロティつき） -->
  <rect x="34" y="70" width="120" height="46" rx="2" fill="#E6E2DB"/>
  <rect x="34" y="70" width="120" height="4" fill="#C9C2B7"/>
  <rect x="42" y="80" width="104" height="8" rx="1" fill="#5E6D7B"/>
  <rect x="42" y="94" width="104" height="8" rx="1" fill="#5E6D7B"/>
  ${mullions(42, 146, 13, 80, 8, '#E6E2DB')}${mullions(42, 146, 13, 94, 8, '#E6E2DB')}
  <rect x="40" y="107" width="108" height="9" fill="#9AA3AC"/>
  ${[48, 72, 96, 120, 142].map((x) => `<rect x="${x}" y="107" width="4" height="9" fill="#E6E2DB"/>`).join('')}
  <!-- 中央：大きな庇の塔 -->
  <rect x="158" y="42" width="60" height="74" fill="#EDEFF1"/>
  <rect x="150" y="36" width="76" height="7" rx="1" fill="#C3C9CF"/>
  ${grid([166, 182, 198], [52, 64, 76, 88], 11, 7, '#687887')}
  <rect x="178" y="101" width="20" height="15" fill="#52606C"/>
  <!-- 右：ガラスの建物（メディアセンター風） -->
  <rect x="224" y="64" width="106" height="5" rx="1" fill="#C3C9CF"/>
  <rect x="228" y="69" width="98" height="47" fill="#A7D1E2"/>
  ${mullions(228, 326, 14, 69, 47, '#88BFD4')}
  <rect x="228" y="90" width="98" height="2" fill="#88BFD4"/>
  <path d="M236 74 l10 0 l-14 14 l0 -10z" fill="#C8E4EF"/>
  ${tree(150, 102, 10)}${tree(218, 104, 9)}
  <!-- 芝生 -->
  <ellipse cx="184" cy="156" rx="200" ry="50" fill="#7EBF5D"/>
  <ellipse cx="184" cy="150" rx="198" ry="47" fill="#99D476"/>
  <g stroke="#86C666" stroke-width="2" stroke-linecap="round" fill="none">
    <path d="M150 128 l2 -5 l2 5"/><path d="M262 172 l2 -5 l2 5"/><path d="M318 140 l2 -5 l2 5"/><path d="M196 186 l2 -5 l2 5"/>
  </g>
  <!-- 鴨池 -->
  <ellipse cx="70" cy="167" rx="48" ry="14" fill="#62B2D8"/>
  <ellipse cx="70" cy="165" rx="45" ry="11.5" fill="#8BCEEB"/>
  <path d="M46 165 q6 -2.5 12 0 M76 170 q5 -2 10 0" stroke="#fff" stroke-opacity=".7" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <g transform="translate(88 160)">
    <ellipse cx="0" cy="0" rx="5.5" ry="3.2" fill="#8C6A4B"/>
    <circle cx="4" cy="-3.2" r="2.6" fill="#3F8E5C"/>
    <path d="M6.3 -3.6 l3 .6 l-3 .8z" fill="#F2B233"/>
  </g>
</svg>`;

// ---------------------------------------------------------------
// ドット絵（右向き）
//   o 輪郭  b 体  s 影  h 光  e 目  p ほっぺ
// ---------------------------------------------------------------
const SLIME = [
  '....oooooo....',
  '..oobbbbbboo..',
  '.obhhbbbbbbbo.',
  '.obhbbbbbbbbo.',
  'obbbbbbbebbebo',
  'obbbbbbbebbebo',
  'obbbbbbpbbpbbo',
  'obbbbbbbbbbbbo',
  'obssbbbbbbbsso',
  '.o' + 's'.repeat(10) + 'o.',
  '..oooooooooo..',
];

// かくれんぼ中の自分：おばけ（すそが3つに分かれている）
const GHOST = [
  '....oooooo....',
  '..oobbbbbboo..',
  '.obbbbbbbbbbo.',
  '.obhbbbbbbbbo.',
  'obhbbbbbebbebo',
  'obbbbbbbebbebo',
  'obbbbbbpbbpbbo',
  'obbbbbbbbbbbbo',
  'obbbbbbbbbbbbo',
  'obbsbbbbbbsbbo',
  'obboobbbboobbo',
  '.oo..oooo..oo.',
];

const PX = 4;
const SLIME_H = SLIME.length * PX;
const COLORS = ['#5CD2E6', '#6CD47A', '#F26B5E', '#C6A0F2', '#FFD15A', '#FF9CC6', '#4FC3A1', '#7FA6FF'];
/** 自分のスライムの色（フレンドの色には使わない） */
export const SELF_COLOR = '#FF8A3D';
const SELF_ID = '__self';

/** 色を明るく（amt > 0）または暗く（amt < 0）する */
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

/** フレンドごとのスライムの色（フレンド一覧のアイコンも同じ色にする） */
export function colorOf(id: string) {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function spriteSvg(rows: string[], fill: Record<string, string>, extraClass = '') {
  let open = '';
  let rest = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    const r = `<rect x="${x}" y="${y}" width="1" height="1"`;
    if (ch === 'e') open += `${r} fill="${fill.o}"/>`;
    else rest += `${r} fill="${fill[ch]}"${ch === 'p' ? ' opacity=".75"' : ''}/>`;
  }));
  // まばたき用：目を閉じたときは、目の下の段だけ残す
  const closed = `<rect x="8" y="5" width="1" height="1" fill="${fill.o}"/><rect x="11" y="5" width="1" height="1" fill="${fill.o}"/>
    <rect x="8" y="4" width="1" height="1" fill="${fill.b}"/><rect x="11" y="4" width="1" height="1" fill="${fill.b}"/>`;
  return `<svg class="${extraClass}" width="${rows[0].length * PX}" height="${rows.length * PX}" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">
    ${rest}<g class="eyes-open">${open}</g><g class="eyes-closed">${closed}</g></svg>`;
}

/** スライムのドット絵。地図（src/field/campusMap.ts）でも同じ絵を使う。 */
export const slimeSvg = (color: string) =>
  spriteSvg(SLIME, { o: '#2E2A45', b: color, s: shade(color, -0.22), h: shade(color, 0.6), p: '#FF8FA8' });
const ghostSvg = () =>
  spriteSvg(GHOST, { o: '#5E5885', b: '#F3F0FF', s: '#D9D3F2', h: '#FFFFFF', p: '#FFB3C4' }, 'ghost-sprite');

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// ---------------------------------------------------------------
// 動き
// ---------------------------------------------------------------
type Mode = 'drop' | 'idle' | 'hop' | 'float' | 'leave';
interface Slime {
  id: string;
  self: boolean;
  ghost: boolean;
  color: string;
  node: HTMLDivElement;
  body: HTMLElement;
  shadow: HTMLElement;
  x: number; y: number; dir: 1 | -1;
  hop: number; sx: number; sy: number;
  mode: Mode; t0: number; landedAt: number; nextAt: number; hopsLeft: number;
  from: { x: number; y: number }; to: { x: number; y: number };
  moving: boolean;
  phase: number; blinkAt: number; nameTimer?: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const onLawn = (x: number, y: number) => ((x - LAWN.cx) / LAWN.rx) ** 2 + ((y - LAWN.cy) / LAWN.ry) ** 2 <= 0.82 && x > 26 && x < VW - 26;
const inPond = (x: number, y: number) => ((x - POND.cx) / POND.rx) ** 2 + ((y - POND.cy) / POND.ry) ** 2 <= 1;
const walkable = (x: number, y: number) => onLawn(x, y) && !inPond(x, y);
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

export function createCampusField(): CampusField {
  const el = document.createElement('div');
  el.className = 'field-scene';
  el.innerHTML = `${SCENE}<div class="slimes"></div>`;
  const layer = el.querySelector('.slimes') as HTMLDivElement;
  const slimes = new Map<string, Slime>();
  let raf = 0;

  function freeSpot() {
    for (let i = 0; i < 60; i++) {
      const x = rnd(30, VW - 30);
      const y = rnd(118, 192);
      if (!walkable(x, y)) continue;
      if ([...slimes.values()].some((s) => s.mode !== 'leave' && Math.hypot(s.x - x, (s.y - y) * 1.6) < 46)) continue;
      return { x, y };
    }
    return { x: rnd(150, 300), y: rnd(135, 175) };
  }

  function drawBody(s: Slime) {
    s.body.innerHTML = (s.ghost ? ghostSvg() : slimeSvg(s.color)) + (s.self ? '<span class="self-mark"></span>' : '');
    s.node.classList.toggle('is-ghost', s.ghost);
  }

  function place(s: Slime) {
    const k = el.clientWidth / VW || 1;
    s.node.style.transform = `translate(${s.x * k}px, ${s.y * k}px)`;
    s.node.style.zIndex = String(Math.round(s.y));
    s.body.style.transform = `translateY(${-s.hop}px) scale(${s.dir * s.sx}, ${s.sy})`;
    const lift = Math.min(s.hop / 60, 1);
    s.shadow.style.transform = `scale(${1 - lift * 0.5})`;
    s.shadow.style.opacity = String((1 - lift * 0.6) * (s.ghost ? 0.45 : 1));
  }

  function spawn(id: string, name: string, color: string, self: boolean, ghost: boolean) {
    const node = document.createElement('div');
    node.className = `slime${self ? ' self' : ''}`;
    node.innerHTML = `<span class="slime-shadow"></span><span class="slime-body"></span><span class="slime-name">${escapeHtml(name)}</span>`;
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', self ? (ghost ? 'あなた（かくれんぼ中）' : 'あなた') : `${name}さん`);
    layer.appendChild(node);
    const spot = freeSpot();
    const now = performance.now();
    const s: Slime = {
      id, self, ghost, color, node,
      body: node.querySelector('.slime-body') as HTMLElement,
      shadow: node.querySelector('.slime-shadow') as HTMLElement,
      x: spot.x, y: spot.y, dir: Math.random() < 0.5 ? -1 : 1, hop: 0, sx: 1, sy: 1,
      mode: ghost ? 'float' : reduceMotion() ? 'idle' : 'drop', t0: now, landedAt: -1e9, nextAt: now + rnd(700, 1600), hopsLeft: 0,
      from: spot, to: spot, moving: false, phase: rnd(0, 6.28), blinkAt: now + rnd(1500, 4000),
    };
    drawBody(s);
    if (ghost) puff(s);
    // タップすると名前が少しだけ出る
    node.addEventListener('click', () => {
      node.classList.add('named');
      window.clearTimeout(s.nameTimer);
      s.nameTimer = window.setTimeout(() => node.classList.remove('named'), 1600);
    });
    slimes.set(id, s);
    place(s);
    start();
  }

  // 切り替わるときの「ぽん」という煙
  function puff(s: Slime) {
    const p = document.createElement('span');
    p.className = 'puff';
    p.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
    s.node.appendChild(p);
    window.setTimeout(() => p.remove(), 600);
  }

  function hop(s: Slime, now: number) {
    for (let i = 0; i < 8; i++) {
      const dir = (i < 4 ? s.dir : -s.dir) as 1 | -1;
      const tx = s.x + dir * rnd(14, 30);
      const ty = s.y + rnd(-8, 8);
      if (walkable(tx, ty)) { s.dir = dir; s.mode = 'hop'; s.t0 = now; s.from = { x: s.x, y: s.y }; s.to = { x: tx, y: ty }; return; }
    }
    s.dir = (-s.dir) as 1 | -1; s.hopsLeft = 0; s.nextAt = now + 600;
  }

  function decide(s: Slime, now: number) {
    const r = Math.random();
    if (r < 0.22) { s.dir = (-s.dir) as 1 | -1; s.nextAt = now + rnd(500, 1300); return; } // 振り向く
    if (r < 0.34) { s.nextAt = now + rnd(900, 2200); return; }                             // ひと休み
    s.hopsLeft = Math.floor(rnd(1, 4));                                                    // 何回か跳ねて移動
    hop(s, now);
  }

  // おばけは跳ねずに、ふわふわ漂う（池の上も通れる）
  function float(s: Slime, now: number, reduce: boolean) {
    if (s.moving) {
      const p = Math.min((now - s.t0) / 1700, 1);
      const e = ease(p);
      s.x = s.from.x + (s.to.x - s.from.x) * e;
      s.y = s.from.y + (s.to.y - s.from.y) * e;
      if (p >= 1) { s.moving = false; s.nextAt = now + rnd(700, 2200); }
    } else if (!reduce && now >= s.nextAt) {
      if (Math.random() < 0.25) { s.dir = (-s.dir) as 1 | -1; s.nextAt = now + rnd(600, 1400); }
      else {
        for (let i = 0; i < 8; i++) {
          const tx = s.x + rnd(-55, 55);
          const ty = s.y + rnd(-12, 12);
          if (onLawn(tx, ty)) { s.dir = tx >= s.x ? 1 : -1; s.from = { x: s.x, y: s.y }; s.to = { x: tx, y: ty }; s.t0 = now; s.moving = true; break; }
        }
        if (!s.moving) s.nextAt = now + 800;
      }
    }
    const wave = reduce ? 0 : Math.sin(now / 480 + s.phase);
    s.hop = 12 + wave * 4;
    s.sx = 1 + wave * 0.03;
    s.sy = 1 - wave * 0.03;
  }

  function tick(now: number) {
    raf = 0;
    if (!slimes.size) return;
    const reduce = reduceMotion();
    for (const s of [...slimes.values()]) {
      if (now >= s.blinkAt) {
        s.body.classList.add('blink');
        window.setTimeout(() => s.body.classList.remove('blink'), 140);
        s.blinkAt = now + rnd(2200, 5200);
      }
      if (s.mode === 'drop') {
        const p = Math.min((now - s.t0) / 520, 1);
        s.hop = (1 - p * p) * 110;
        s.sx = 0.9; s.sy = 1.12;
        if (p >= 1) { s.mode = 'idle'; s.hop = 0; s.landedAt = now; s.nextAt = now + rnd(600, 1400); }
      } else if (s.mode === 'hop') {
        const p = Math.min((now - s.t0) / 400, 1);
        s.x = s.from.x + (s.to.x - s.from.x) * p;
        s.y = s.from.y + (s.to.y - s.from.y) * p;
        const arc = Math.sin(Math.PI * p);
        s.hop = arc * 13;
        s.sx = 1 - arc * 0.1; s.sy = 1 + arc * 0.12;
        if (p >= 1) {
          s.mode = 'idle'; s.hop = 0; s.landedAt = now;
          s.hopsLeft -= 1;
          s.nextAt = now + (s.hopsLeft > 0 ? 200 : rnd(900, 2400));
        }
      } else if (s.mode === 'float') {
        float(s, now, reduce);
      } else if (s.mode === 'leave') {
        const p = Math.min((now - s.t0) / 360, 1);
        s.sy = 1 - p * 0.8; s.sx = 1 + p * 0.3;
        s.node.style.opacity = String(1 - p);
        if (p >= 1) { s.node.remove(); slimes.delete(s.id); continue; }
      }
      if (s.mode === 'idle') {
        const q = (now - s.landedAt) / 200;
        const squash = q < 1 ? 1 - q : 0;
        const breathe = reduce ? 0 : Math.sin(now / 320 + s.phase) * 0.03;
        s.sx = 1 + squash * 0.16 - breathe * 0.6;
        s.sy = 1 - squash * 0.18 + breathe;
        if (!reduce && now >= s.nextAt) {
          if (s.hopsLeft > 0) hop(s, now); else decide(s, now);
        }
      }
      place(s);
    }
    start();
  }

  function start() { if (!raf && slimes.size) raf = requestAnimationFrame(tick); }

  function leave(s: Slime) { if (s.mode !== 'leave') { s.mode = 'leave'; s.t0 = performance.now(); } }

  function setGhost(ghost: boolean) {
    const s = slimes.get(SELF_ID);
    if (!s || s.mode === 'leave' || s.ghost === ghost) return;
    s.ghost = ghost;
    s.moving = false;
    s.node.setAttribute('aria-label', ghost ? 'あなた（かくれんぼ中）' : 'あなた');
    drawBody(s);
    puff(s);
    if (ghost) { s.mode = 'float'; s.nextAt = performance.now() + 900; }
    else { s.mode = 'idle'; s.hop = 0; s.landedAt = performance.now(); s.nextAt = performance.now() + 900; }
    start();
  }

  return {
    el,

    sync(friends, self) {
      const ids = new Set(friends.map((f) => f.userId));
      for (const s of slimes.values()) {
        if (!s.self && !ids.has(s.id)) leave(s);
      }

      // 自分のスライム
      const mine = slimes.get(SELF_ID);
      let order = 0;
      if (!self.present) {
        if (mine) leave(mine);
      } else if (!mine || mine.mode === 'leave') {
        if (mine) { mine.node.remove(); slimes.delete(SELF_ID); }
        spawn(SELF_ID, 'あなた', SELF_COLOR, true, self.ghost);
        order = 1;
      } else {
        setGhost(self.ghost);
      }

      const fresh = friends.filter((f) => !slimes.has(f.userId) || slimes.get(f.userId)!.mode === 'leave');
      fresh.forEach((f, i) => {
        const old = slimes.get(f.userId);
        if (old) { old.node.remove(); slimes.delete(f.userId); }
        window.setTimeout(() => spawn(f.userId, f.name, colorOf(f.userId), false, false), (order + i) * 150);
      });
      start();
      const count = order + fresh.length;
      if (!count) return 150;
      return reduceMotion() ? 200 : 560 + (count - 1) * 150;
    },

    setGhost,

    pop(userId, text) {
      const s = slimes.get(userId);
      if (!s || !el.isConnected || s.mode === 'leave') return false;
      const k = el.clientWidth / VW || 1;
      const p = document.createElement('span');
      p.className = 'pop';
      p.textContent = text;
      p.style.left = `${s.x * k}px`;
      p.style.top = `${s.y * k - SLIME_H - 8}px`;
      layer.appendChild(p);
      window.setTimeout(() => p.remove(), 1100);
      // 喜んでその場で跳ねる
      if (!reduceMotion() && s.mode === 'idle') {
        s.hopsLeft = 0; s.mode = 'hop'; s.t0 = performance.now(); s.from = { x: s.x, y: s.y }; s.to = { x: s.x, y: s.y };
      }
      return true;
    },

    clear() {
      for (const s of slimes.values()) s.node.remove();
      slimes.clear();
      layer.querySelectorAll('.pop').forEach((p) => p.remove());
    },
  };
}

