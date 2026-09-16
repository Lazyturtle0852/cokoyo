// 地図：だれがどの建物にいるか
//
// ホーム上部のキャンパスの図をタップすると出てくる。
// 建物まで見えるのはベストフレンド同士のときだけなので、
// キャンパスにはいるけれど場所が分からない人は、下のトレイにまとめる。
// （出し分けはバックエンドがやっている。ここに来る時点で buildingKey が無い。）

import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { colorOf, SELF_COLOR, shade, slimeSvg } from '../field/campusField';
import { MAP_BUILDINGS, MAP_H, MAP_SCENE, MAP_W, type MapBuilding } from '../field/campusMap';
import { Avatar, Icon, when } from './ui';

const SELF_ID = '__self';

interface Pin {
  id: string;
  name: string;
  color: string;
  self: boolean;
}

export function CampusMap() {
  const { me, friends, lastCheck: lc, closeMap, check, checking } = useApp();
  const [picked, setPicked] = useState<string | null>(null);

  if (!me || !friends) return null;

  const named = new Map(friends.friends.map((f) => [f.userId, f.displayName]));

  // 建物ごとに、そこにいる人を集める
  const byBuilding = new Map<string, Pin[]>();
  const put = (key: string, pin: Pin) => {
    const list = byBuilding.get(key);
    if (list) list.push(pin);
    else byBuilding.set(key, [pin]);
  };

  if (lc?.me.present && lc.me.buildingKey) {
    put(lc.me.buildingKey, { id: SELF_ID, name: 'あなた', color: SELF_COLOR, self: true });
  }
  const somewhere: Pin[] = [];
  for (const f of lc?.friends ?? []) {
    if (!f.present) continue;
    const pin: Pin = {
      id: f.userId,
      name: named.get(f.userId) ?? '',
      color: colorOf(f.userId),
      self: false,
    };
    if (f.buildingKey) put(f.buildingKey, pin);
    else somewhere.push(pin);
  }
  // 自分が在校していて、建物までは分からないとき
  if (lc?.me.present && !lc.me.buildingKey) {
    somewhere.unshift({ id: SELF_ID, name: 'あなた', color: SELF_COLOR, self: true });
  }

  const here = picked ? (byBuilding.get(picked) ?? []) : [];
  const pickedBuilding = picked ? MAP_BUILDINGS.find((b) => b.key === picked) : undefined;
  const total = [...byBuilding.values()].reduce((n, l) => n + l.length, 0) + somewhere.length;

  return (
    <div className="map-screen">
      <div className="map-bar">
        <button className="map-back" onClick={closeMap} aria-label="ホームにもどる"><Icon.Back /></button>
        <div className="map-title">
          キャンパスの地図
          <span>{lc ? `${when(lc.checkedAt)} 時点・${total}人` : 'まだ確認していません'}</span>
        </div>
      </div>

      <div className="map-body">
        <div className="map-stage">
          <svg
            className="map-svg"
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            role="img"
            aria-label="キャンパスの地図。建物をタップすると、そこにいる人が出ます"
          >
            <g dangerouslySetInnerHTML={{ __html: MAP_SCENE }} />
            {MAP_BUILDINGS.map((b) => (
              <Building
                key={b.key}
                b={b}
                count={byBuilding.get(b.key)?.length ?? 0}
                on={picked === b.key}
                onPick={() => setPicked((p) => (p === b.key ? null : b.key))}
              />
            ))}
          </svg>

          {/* スライムは建物の上にのせる。SVGの座標を％に直して重ねる */}
          <div className="map-pins">
            {MAP_BUILDINGS.map((b) => {
              const pins = byBuilding.get(b.key);
              if (!pins?.length) return null;
              return (
                <button
                  key={b.key}
                  className={`map-pin${picked === b.key ? ' on' : ''}`}
                  // 建物の北がわの端に立たせて、まんなかの字を隠さないようにする
                  style={{ left: `${(b.cx / MAP_W) * 100}%`, top: `${((b.cy - b.h * 0.34) / MAP_H) * 100}%` }}
                  onClick={() => setPicked((p) => (p === b.key ? null : b.key))}
                  aria-label={`${b.label}に${pins.length}人`}
                >
                  {pins.slice(0, 3).map((p) => (
                    <span
                      key={p.id}
                      className={`map-slime${p.self ? ' self' : ''}`}
                      dangerouslySetInnerHTML={{ __html: slimeSvg(p.color) }}
                    />
                  ))}
                  {pins.length > 3 && <span className="map-more">+{pins.length - 3}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {pickedBuilding && (
          <div className="card map-card">
            <div className="map-card-head">
              <span className="map-glyph">{pickedBuilding.glyph}</span>
              <div>
                <div className="map-card-name">{pickedBuilding.label}</div>
                <div className="map-card-sub">{here.length ? `${here.length}人がここに` : 'だれもいません'}</div>
              </div>
            </div>
            {here.map((p) => (
              <div className="friend" key={p.id}>
                <SelfOrAvatar pin={p} />
                <div className="fbody"><div className="fname">{p.name}</div></div>
              </div>
            ))}
          </div>
        )}

        {somewhere.length > 0 && (
          <>
            <div className="sec"><h3>キャンパスのどこか</h3><span>{somewhere.length}人</span></div>
            <div className="card">
              {somewhere.map((p) => (
                <div className="friend" key={p.id}>
                  <SelfOrAvatar pin={p} />
                  <div className="fbody">
                    <div className="fname">{p.name}</div>
                    <div className="fmeta">建物までは、ベストフレンド同士だと見えます</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!lc && (
          <div className="card map-empty">
            <p>「ポイント獲得（在校確認）」を押すと、いまキャンパスにいる人が地図に出ます。</p>
            <button className="btn btn-primary" onClick={() => void check()} disabled={checking}>
              {checking ? '確認しています…' : 'ここで確認する'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** 自分はスライムと同じオレンジ、フレンドはいつものアバター。 */
function SelfOrAvatar({ pin }: { pin: Pin }) {
  if (!pin.self) return <Avatar userId={pin.id} name={pin.name} on />;
  return (
    <div className="av on" style={{ background: shade(SELF_COLOR, 0.72), color: shade(SELF_COLOR, -0.5) }}>
      <span className="ring" />あ
    </div>
  );
}

function Building({ b, count, on, onPick }: { b: MapBuilding; count: number; on: boolean; onPick(): void }) {
  const live = count > 0;
  const fill = b.soft ? (live ? '#7BC96F' : '#CFE3C4') : live ? 'var(--brand)' : '#D6CFC6';
  const ink = live ? '#FFFFFF' : '#A29A91';
  // ギリシャ文字は1字で大きく。「体育」「ラウンジ」は全角なので、幅に収まるまで小さくする
  const fontSize = b.glyph.length === 1
    ? Math.min(b.h * 0.8, 19)
    : Math.min(b.h * 0.7, (b.w * 0.86) / b.glyph.length);
  return (
    <g
      className={`map-bld${live ? ' live' : ''}${on ? ' on' : ''}`}
      transform={`translate(${b.cx} ${b.cy}) rotate(${b.angle})`}
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); } }}
      aria-label={`${b.label}${live ? `・${count}人` : ''}`}
    >
      <rect x={-b.w / 2} y={-b.h / 2 + 2.5} width={b.w} height={b.h} rx={6} fill="rgba(28,25,23,.10)" />
      <rect x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h} rx={6} fill={fill} />
      {on && <rect x={-b.w / 2 - 3} y={-b.h / 2 - 3} width={b.w + 6} height={b.h + 6} rx={9} fill="none" stroke="var(--ink)" strokeWidth="2" />}
      <text
        x={0}
        y={0}
        transform={`rotate(${-b.angle})`}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight="800"
        fill={ink}
      >
        {b.glyph}
      </text>
    </g>
  );
}
