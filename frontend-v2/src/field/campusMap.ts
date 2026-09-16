// 地図のかたち（ホーム上部の図をタップすると出てくる画面で使う）
//
// 位置は DTC の GET https://api.dtc.wide.ad.jp/areas （2026-09-16 に取得）から。
// 建物ごとに代表点の緯度経度があり、κ ε ι ο λ の5棟は east / west の棟にも
// 点がついているので、そこから建物の向きと長さを起こしている。
//
// ブラウザからは DTC を呼ばない。DTC に触れてよいのはバックエンドだけ、という
// 決めごと（docs/v1-poc.html の「MACの壁」）を崩さないため、ここは焼き込んだ写し。
// 厳密な測量図ではなく、だいたいのエリアが分かればよい。

import type { BuildingKey } from '../api/types';

/** /areas が返した代表点（WGS84）。areaKey をそのままキーにしている。 */
const POINTS: Record<string, { lat: number; lon: number }> = {
  kappa: { lat: 35.38769778985321, lon: 139.42629183849573 },
  'kappa-east': { lat: 35.38766754322459, lon: 139.42647734323478 },
  'kappa-west': { lat: 35.38772803648184, lon: 139.42610633375665 },
  epsilon: { lat: 35.38802143802205, lon: 139.426381389195 },
  'epsilon-east': { lat: 35.38799521449192, lon: 139.42657318734993 },
  'epsilon-west': { lat: 35.38804766155217, lon: 139.42618959104004 },
  iota: { lat: 35.388377259644585, lon: 139.42647283270304 },
  'iota-east': { lat: 35.38835770868682, lon: 139.426659151962 },
  'iota-west': { lat: 35.38839681060235, lon: 139.4262865134441 },
  omicron: { lat: 35.38872023297198, lon: 139.42657139353304 },
  'omicron-east': { lat: 35.388694621454775, lon: 139.4267638156266 },
  'omicron-west': { lat: 35.388745844489186, lon: 139.42637897143948 },
  lambda: { lat: 35.389055317525795, lon: 139.426858977947 },
  'lambda-east': { lat: 35.389007294846074, lon: 139.42706799479575 },
  'lambda-west': { lat: 35.389103340205516, lon: 139.4266499610983 },
  delta: { lat: 35.388256, lon: 139.425467 },
  tau: { lat: 35.38920854888373, lon: 139.42568996657866 },
  mu: { lat: 35.388259, lon: 139.427324 },
  omega: { lat: 35.387849358138276, lon: 139.42779042886363 },
  alpha: { lat: 35.388436, lon: 139.427969 },
  theta: { lat: 35.38892181273767, lon: 139.42754460945537 },
  'pe-buildings': { lat: 35.390103, lon: 139.426268 },
  sigma: { lat: 35.387181, lon: 139.42613 },
  lounge: { lat: 35.387606, lon: 139.427354 },
};

// 緯度経度 → 画面の座標。北が上。
// 経度は緯度35.39°の縮みぶん（cos）で詰める。1度ぶんのメートルは概算でよい。
const DEG_M = 111320;
const LON_M = DEG_M * Math.cos((35.3886 * Math.PI) / 180);
const ORIGIN = { lat: 35.387181, lon: 139.425467 }; // 南西のすみ（σ館と δ館）
const SPAN_M = { x: 227, y: 325 }; // キャンパスの実寸はおよそ 227m × 325m
const SCALE = 1.06; // メートル → viewBox の単位
const PAD = { x: 26, y: 26 };

export const MAP_W = Math.round(SPAN_M.x * SCALE + PAD.x * 2);
export const MAP_H = Math.round(SPAN_M.y * SCALE + PAD.y * 2);

/** メートル（南西のすみが原点、北が上）→ viewBox の座標 */
const X = (m: number) => m * SCALE + PAD.x;
const Y = (m: number) => (SPAN_M.y - m) * SCALE + PAD.y;

function project(key: string) {
  const p = POINTS[key];
  return {
    x: X((p.lon - ORIGIN.lon) * LON_M),
    y: Y((p.lat - ORIGIN.lat) * DEG_M),
  };
}

export interface MapBuilding {
  key: BuildingKey;
  /** 図の中に大きく出す字 */
  glyph: string;
  /** 読み上げと吹き出しに使う名前。BUILDING_LABELS と同じ。 */
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 長い辺の傾き（度）。 */
  angle: number;
  /** 建物ではなく、広場や池のようなところ */
  soft?: boolean;
}

/** east / west の点から、向きと長さを起こす。 */
function fromWings(key: BuildingKey, glyph: string, label: string, depth: number, pad: number): MapBuilding {
  const c = project(key);
  const w = project(`${key}-west`);
  const e = project(`${key}-east`);
  return {
    key, glyph, label,
    cx: c.x, cy: c.y,
    w: Math.hypot(e.x - w.x, e.y - w.y) + pad,
    h: depth,
    angle: (Math.atan2(e.y - w.y, e.x - w.x) * 180) / Math.PI,
  };
}

/** 代表点しか無いところ。大きさは図としての見え方で決める。 */
function fromPoint(
  key: BuildingKey, glyph: string, label: string,
  w: number, h: number, angle = 0, soft = false,
): MapBuilding {
  const c = project(key);
  return { key, glyph, label, cx: c.x, cy: c.y, w, h, angle, ...(soft ? { soft } : {}) };
}

/** 奥にあるものが先。あとのものが上に重なる。 */
export const MAP_BUILDINGS: MapBuilding[] = [
  fromPoint('pe-buildings', '体育', '体育施設', 74, 26, -6, true),
  fromPoint('tau', 'τ', 'τ館', 40, 34, 0),
  fromWings('lambda', 'λ', 'λ館', 24, 20),
  fromPoint('theta', 'θ', 'θ館', 38, 32, 0),
  fromWings('omicron', 'ο', 'ο館', 24, 20),
  fromWings('iota', 'ι', 'ι館', 24, 20),
  fromPoint('alpha', 'α', 'α館', 34, 56, -8),
  fromPoint('mu', 'μ', 'μ館', 52, 28, -4),
  fromPoint('delta', 'δ', 'δ館', 36, 30, 0),
  fromWings('epsilon', 'ε', 'ε館', 24, 20),
  fromWings('kappa', 'κ', 'κ館', 24, 20),
  fromPoint('lounge', 'ラウンジ', 'ラウンジ', 54, 24, -4, true),
  fromPoint('omega', 'ω', 'ω館', 44, 30, -10),
  fromPoint('sigma', 'σ', 'σ館', 46, 26, 12),
];

// ---------------------------------------------------------------
// 背景：外周道路・池・緑
// 形はだいたいで、参考にしたキャンパスマップの雰囲気に寄せてある。
// ---------------------------------------------------------------

/** メートルで置いた点を、なめらかな閉じた線にする。 */
function loop(points: [number, number][]) {
  const p = points.map(([mx, my]) => [X(mx), Y(my)] as const);
  const n = p.length;
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const prev = p[(i - 1 + n) % n];
    const next = p[(i + 2) % n];
    const c1 = [a[0] + (b[0] - prev[0]) / 6, a[1] + (b[1] - prev[1]) / 6];
    const c2 = [b[0] - (next[0] - a[0]) / 6, b[1] - (next[1] - a[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

/**
 * キャンパスをぐるりと回る道。σ館の南は図の外まで続くので、
 * はみ出したぶんは角丸の内側で切る。
 */
const RING = loop([
  [105, 250], [200, 220], [245, 140], [240, 60],
  [170, -18], [70, -28], [18, 60], [18, 130], [28, 190],
]);

/** 鴨池。κ館・ε館の西がわ。 */
const POND = loop([[30, 100], [44, 84], [45, 62], [32, 48], [14, 58], [11, 82]]);

/** 中を抜ける道 */
const PATHS = [
  [[62, 10], [86, 96], [104, 176], [128, 214]],
  [[90, 128], [150, 120], [196, 128]],
] as const;

export const MAP_SCENE = `<g aria-hidden="true">
  <clipPath id="map-clip"><rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" rx="22"/></clipPath>
  <g clip-path="url(#map-clip)">
    <rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" fill="#F4F1EC"/>
    <!-- 緑地 -->
    <ellipse cx="${X(120)}" cy="${Y(130)}" rx="${118 * SCALE}" ry="${132 * SCALE}" fill="#E5EFDB"/>
    <ellipse cx="${X(196)}" cy="${Y(78)}" rx="${46 * SCALE}" ry="${40 * SCALE}" fill="#DDECD0"/>
    <ellipse cx="${X(58)}" cy="${Y(246)}" rx="${44 * SCALE}" ry="${36 * SCALE}" fill="#DDECD0"/>
    <!-- 中を抜ける道（外周より下に敷く） -->
    ${PATHS.map((pts) => `<polyline points="${pts.map(([mx, my]) => `${X(mx).toFixed(1)},${Y(my).toFixed(1)}`).join(' ')}" fill="none" stroke="#EDE8E1" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}
    <!-- 外周道路 -->
    <path d="${RING}" fill="none" stroke="#DCD5CB" stroke-width="16" stroke-linejoin="round"/>
    <path d="${RING}" fill="none" stroke="#EFEAE3" stroke-width="10" stroke-linejoin="round"/>
    <!-- 鴨池 -->
    <path d="${POND}" fill="#57ABD4"/>
    <path d="${POND}" fill="#8BCEEB" transform="translate(0 -3)"/>
  </g>
  <text x="${X(29)}" y="${Y(33)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#2E7FA6">鴨池</text>
</g>`;
