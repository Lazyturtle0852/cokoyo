// 地図のかたち（ホーム上部の図をタップすると出てくる画面で使う）
//
// 建物・鴨池・外周道路（メビウスリング）・歩道の形は OpenStreetMap から起こした
// （campusMapData.ts）。DTC の GET /areas の代表点とも数メートルの差で一致している。
//
// ブラウザからは DTC も OSM も呼ばない。DTC に触れてよいのはバックエンドだけ、という
// 決めごと（docs/v1-poc.html の「MACの壁」）を崩さないため、ここは焼き込んだ写し。

import type { BuildingKey } from '../api/types';
import { BUILDING_LABELS } from '../api/types';
import { BETA_SHAPES, BUILDING_SHAPES, GROUND_SHAPES, OTHER_SHAPES, PARKING_SHAPES, POND_SHAPE, RING_ROAD, WALKS } from './campusMapData';

type Pt = readonly [number, number];

/** 図に入れる範囲（メートル）。北の体育施設から南の外周道路、東のβヴィレッジまで。 */
const BOUNDS = { west: -30, east: 428, south: -92, north: 380 };

export const MAP_W = BOUNDS.east - BOUNDS.west;
export const MAP_H = BOUNDS.north - BOUNDS.south;

/** メートル（東向きが正）→ viewBox の x */
const X = (m: number) => m - BOUNDS.west;
/** メートル（北向きが正）→ viewBox の y */
const Y = (m: number) => BOUNDS.north - m;

const pts = (p: readonly Pt[]) => p.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');

export interface MapBuilding {
  key: BuildingKey;
  /** 図の中に大きく出す字 */
  glyph: string;
  /** 読み上げと吹き出しに使う名前。BUILDING_LABELS と同じ。 */
  label: string;
  /** <polygon points> にそのまま入れる */
  points: string;
  /** 字を置く位置（viewBox） */
  cx: number;
  cy: number;
  /** 外形の上端（viewBox）。スライムを立たせる */
  top: number;
  /** 字の大きさ */
  size: number;
  /** 建物ではなく、体育施設やラウンジのようなところ */
  soft?: boolean;
}

/** 面積で重みをつけた重心。2棟が渡り廊下でつながった形でも、まんなかに来る。 */
function centroid(p: readonly Pt[]) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % p.length];
    const k = x0 * y1 - x1 * y0;
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
  }
  return a ? { x: cx / (3 * a), y: cy / (3 * a) } : { x: p[0][0], y: p[0][1] };
}

const GLYPH: Partial<Record<BuildingKey, string>> = { 'pe-buildings': '体育施設', lounge: 'ラウンジ' };
/** 建物というより区画。字を大きくしない */
const SOFT: BuildingKey[] = ['pe-buildings'];

/** 奥にあるものが先。あとのものが上に重なる。 */
const ORDER: BuildingKey[] = [
  'pe-buildings', 'tau', 'lambda', 'theta', 'omicron', 'iota', 'delta', 'alpha',
  'mu', 'epsilon', 'kappa', 'omega', 'lounge', 'sigma',
];

export const MAP_BUILDINGS: MapBuilding[] = ORDER.map((key) => {
  const shape = BUILDING_SHAPES[key] as readonly Pt[];
  const c = centroid(shape);
  const xs = shape.map((p) => p[0]);
  const ys = shape.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const label = BUILDING_LABELS[key];
  const glyph = GLYPH[key] ?? label.replace('館', '');
  return {
    key, glyph, label,
    points: pts(shape),
    cx: X(c.x),
    cy: Y(c.y),
    top: Y(Math.max(...ys)),
    size: glyph.length === 1 ? Math.min(20, Math.max(13, Math.min(w, h) * 0.6)) : Math.min(12, (w * 0.86) / glyph.length),
    ...(SOFT.includes(key) ? { soft: true } : {}),
  };
});

// ---------------------------------------------------------------
// 背景：緑・外周道路・歩道・鴨池・ほかの建物
// ---------------------------------------------------------------

const ringPath = `M${pts(RING_ROAD).replace(/ /g, ' L')} Z`;
const pond = centroid(POND_SHAPE);

export const MAP_SCENE = `<g aria-hidden="true">
  <clipPath id="map-clip"><rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" rx="22"/></clipPath>
  <g clip-path="url(#map-clip)">
    <rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" fill="#E4EEDA"/>
    <!-- 外周道路の内がわ -->
    <path d="${ringPath}" fill="#F1EEE8"/>
    <!-- 鴨池のまわりの芝生 -->
    <ellipse cx="${X(pond.x)}" cy="${Y(pond.y + 6)}" rx="92" ry="44" fill="#D8EBC8"/>
    <!-- 駐車場 -->
    ${PARKING_SHAPES.map((p) => `<polygon points="${pts(p)}" fill="#E6E2DC"/>`).join('')}
    <!-- 歩道 -->
    ${WALKS.map((w) => `<polyline points="${pts(w)}" fill="none" stroke="#E2D9CE" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}
    <!-- 外周道路（メビウスリング） -->
    <path d="${ringPath}" fill="none" stroke="#D5CDC2" stroke-width="10" stroke-linejoin="round"/>
    <path d="${ringPath}" fill="none" stroke="#F7F4EF" stroke-width="6" stroke-linejoin="round"/>
    <!-- 鴨池 -->
    <polygon points="${pts(POND_SHAPE)}" fill="#57ABD4" transform="translate(0 1.5)"/>
    <polygon points="${pts(POND_SHAPE)}" fill="#8BCEEB"/>
    <!-- グラウンド -->
    ${GROUND_SHAPES.map((g) => `<polygon points="${pts(g.pts)}" fill="#D3E8C3"/>`).join('')}
    <!-- DTC にない建物 -->
    ${OTHER_SHAPES.map((p) => `<polygon points="${pts(p)}" fill="#E1DBD3"/>`).join('')}
    <!-- βヴィレッジ（SBC）。小屋が寄り集まっているので、下じきを敷いてから建てる -->
    <rect x="${X(292)}" y="${Y(340)}" width="${132}" height="${112}" rx="16" fill="#E9F0DF"/>
    ${BETA_SHAPES.map((b) => `<polygon points="${pts(b.pts)}" fill="#D8CFC2"/>`).join('')}
  </g>
  <text x="${X(358)}" y="${Y(346)}" text-anchor="middle" font-size="12" font-weight="700" fill="#7B8B63">βヴィレッジ</text>
  <text x="${X(pond.x)}" y="${Y(pond.y) + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#2E7FA6">鴨池</text>
  <text x="${MAP_W - 10}" y="${MAP_H - 8}" text-anchor="end" font-size="7" fill="#A29A91">© OpenStreetMap contributors</text>
</g>`;
