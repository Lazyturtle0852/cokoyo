#!/usr/bin/env python3
"""COKOYO の交友ネットワークを分析して、図と数字を out/<入力の名前>/ に出す。

  python3 tools/network/analyze.py network_2026-11-11.json   # export.mjs の出力を分析
  python3 tools/network/analyze.py --sample                  # 作り物のデータで試す

出力先を入力の名前ごとに分けるので、日付を変えて書き出したものを並べて残せる。

入力は export.mjs が出す {"nodes": 人数, "edges": [[a, b, best], ...]}。
番号は書き出しのたびに振り直したもので、誰かは分からない。図にも番号は出さない
（小さなネットワークでは、形だけで「この点は自分だ」と分かる人がいるため、
外に出す図に番号を付けて話題にしやすくしない）。

やっていることは https://zenn.dev/nagayu71/articles/37f8dc30354018 と同じ順番:
規模 → 次数分布 → 6種類の中心性 → コミュニティ検出。
"""
from __future__ import annotations

import argparse
import itertools
import json
import random
import statistics
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import networkx as nx

plt.rcParams["font.family"] = ["Hiragino Sans", "Hiragino Maru Gothic ProN", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False

OUT_ROOT = Path(__file__).parent / "out"
EDGE = "#b8bcc4"
BEST = "#e8590c"
SEED = 7  # 図の配置を毎回同じにする


def load(path: str) -> nx.Graph:
    data = json.loads(Path(path).read_text())
    g = nx.Graph()
    g.add_nodes_from(range(data["nodes"]))
    for a, b, best in data["edges"]:
        g.add_edge(a, b, best=bool(best))
    return g


def sample() -> nx.Graph:
    """サークルや学科のような固まりがいくつかあり、誰ともつながっていない人もいる作り物。"""
    rng = random.Random(1)
    sizes = [14, 11, 9, 7, 5]
    g = nx.random_partition_graph(sizes, 0.42, 0.015, seed=3)
    g = nx.Graph(g.edges())
    g.add_nodes_from(range(sum(sizes) + 9))  # フレンド0人
    g.add_edges_from([(50, 51), (52, 53)])  # 2人だけの組
    for a, b in g.edges():
        g.edges[a, b]["best"] = rng.random() < 0.15
    return g


def centralities(g: nx.Graph) -> dict[str, dict[int, float]]:
    # カッツ中心性は alpha が 1/最大固有値 より小さくないと収束しないので、そこから決める。
    lam = max(abs(x) for x in nx.adjacency_spectrum(g))
    return {
        "次数中心性": nx.degree_centrality(g),
        "固有ベクトル中心性": nx.eigenvector_centrality(g, max_iter=5000),
        "カッツ中心性": nx.katz_centrality(g, alpha=0.85 / lam, max_iter=5000),
        "PageRank": nx.pagerank(g),
        "媒介中心性": nx.betweenness_centrality(g),
        "近接中心性": nx.closeness_centrality(g),
    }


def communities(g: nx.Graph) -> list[set[int]]:
    """Girvan-Newman 法。分け方を1段ずつ細かくしていき、モジュラリティが最大の段を採る。"""
    best, best_q = [set(g.nodes())], 0.0
    for parts in itertools.islice(nx.community.girvan_newman(g), 12):
        q = nx.community.modularity(g, parts)
        if q > best_q:
            best, best_q = [set(p) for p in parts], q
    return sorted(best, key=len, reverse=True)


def draw_edges(g: nx.Graph, pos, ax) -> None:
    normal = [(a, b) for a, b, d in g.edges(data=True) if not d.get("best")]
    best = [(a, b) for a, b, d in g.edges(data=True) if d.get("best")]
    nx.draw_networkx_edges(g, pos, edgelist=normal, edge_color=EDGE, width=0.8, ax=ax)
    nx.draw_networkx_edges(g, pos, edgelist=best, edge_color=BEST, width=1.8, ax=ax)
    ax.set_axis_off()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("file", nargs="?")
    ap.add_argument("--sample", action="store_true")
    args = ap.parse_args()
    if not args.sample and not args.file:
        ap.error("network_日付.json を渡すか、--sample を付けてください")
    g = sample() if args.sample else load(args.file)
    name = "sample" if args.sample else Path(args.file).stem
    OUT = OUT_ROOT / name
    OUT.mkdir(parents=True, exist_ok=True)

    n, m = g.number_of_nodes(), g.number_of_edges()
    if m == 0:
        sys.exit(f"人数 {n}、フレンドの組が 0 なので分析できません")
    deg = [d for _, d in g.degree()]
    comps = sorted(nx.connected_components(g), key=len, reverse=True)
    giant = g.subgraph(comps[0]).copy()
    isolated = sum(1 for d in deg if d == 0)
    best_pairs = sum(1 for *_, d in g.edges(data=True) if d.get("best"))

    lines = [
        "# COKOYO 交友ネットワーク（" + ("作り物のデータ" if args.sample else name) + "）",
        "",
        "## 規模",
        f"- 人数 N = {n}、フレンドの組 M = {m}（うち相互ベストフレンド {best_pairs}）",
        f"- 密度 {nx.density(g):.3f}（全員が全員とフレンドなら 1）",
        f"- フレンド数: 平均 {statistics.mean(deg):.2f}、中央値 {statistics.median(deg):g}、最大 {max(deg)}",
        f"- フレンド0人: {isolated} 人",
        f"- つながりの島: {len(comps)} 個（0人の人も1個と数える）。最大の島は {len(comps[0])} 人（全体の {len(comps[0]) / n:.0%}）",
        "",
        "## 最大の島の中",
        f"- 友達の友達が友達である割合（クラスタ係数の平均）: {nx.average_clustering(giant):.3f}",
    ]
    if len(giant) > 1:
        lines += [
            f"- 2人の間の平均距離: {nx.average_shortest_path_length(giant):.2f} 人ぶん",
            f"- いちばん遠い2人の距離（直径）: {nx.diameter(giant)}",
        ]
    if len(set(deg)) > 1:
        lines.append(f"- フレンドの多い人どうしがつながる傾向（次数相関）: {nx.degree_assortativity_coefficient(g):+.3f}")

    pos = nx.spring_layout(giant, seed=SEED, k=1.6 / max(len(giant), 1) ** 0.5, iterations=200)

    # 1. 全体図（フレンド数で大きさを変える）
    fig, ax = plt.subplots(figsize=(9, 8))
    draw_edges(giant, pos, ax)
    nx.draw_networkx_nodes(giant, pos, node_size=[40 + 45 * giant.degree(v) for v in giant], node_color="#4c6ef5",
                           edgecolors="white", linewidths=0.8, ax=ax)
    ax.set_title(f"最大の島（{len(giant)} 人）。点が大きいほどフレンドが多い。橙の線は相互ベストフレンド")
    fig.savefig(OUT / "1-network.png", dpi=160, bbox_inches="tight")
    plt.close(fig)

    # 2. 次数分布
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.hist(deg, bins=range(0, max(deg) + 2), align="left", color="#4c6ef5", edgecolor="white")
    ax.set_xlabel("フレンド数")
    ax.set_ylabel("人数")
    ax.set_title("フレンド数の分布（全員）")
    ax.spines[["top", "right"]].set_visible(False)
    fig.savefig(OUT / "2-degree.png", dpi=160, bbox_inches="tight")
    plt.close(fig)

    # 3. 中心性6種
    cents = centralities(giant)
    fig, axes = plt.subplots(2, 3, figsize=(16, 10))
    for ax, (name, c) in zip(axes.flat, cents.items()):
        vals = [c[v] for v in giant]
        top = max(vals) or 1
        draw_edges(giant, pos, ax)
        nodes = nx.draw_networkx_nodes(giant, pos, node_size=[30 + 320 * v / top for v in vals], node_color=vals,
                                       cmap="viridis", edgecolors="white", linewidths=0.6, ax=ax)
        fig.colorbar(nodes, ax=ax, shrink=0.7)
        ax.set_title(name)
    fig.suptitle("中心性（最大の島）。大きく明るい点ほど値が高い", fontsize=14)
    fig.savefig(OUT / "3-centralities.png", dpi=150, bbox_inches="tight")
    plt.close(fig)

    lines += ["", "## 中心性（最大の島）", "", "| 指標 | 最大 | 中央値 | 上位1割が持つ割合 |", "|---|---|---|---|"]
    for name, c in cents.items():
        vals = sorted(c.values(), reverse=True)
        k = max(1, len(vals) // 10)
        share = sum(vals[:k]) / sum(vals) if sum(vals) else 0
        lines.append(f"| {name} | {vals[0]:.3f} | {statistics.median(vals):.3f} | {share:.0%} |")
    tops = [set(sorted(c, key=c.get, reverse=True)[:5]) for c in cents.values()]
    lines += ["", f"- 6つの指標すべてで上位5人に入る人: {len(set.intersection(*tops))} 人"]
    # つなぎ役: その人が抜けると島が割れる人
    lines.append(f"- 抜けると島が割れる人（関節点）: {len(list(nx.articulation_points(giant)))} 人")

    # 4. コミュニティ
    parts = communities(giant)
    q = nx.community.modularity(giant, parts)
    color = {v: i for i, p in enumerate(parts) for v in p}
    fig, ax = plt.subplots(figsize=(9, 8))
    draw_edges(giant, pos, ax)
    nx.draw_networkx_nodes(giant, pos, node_size=[40 + 45 * giant.degree(v) for v in giant],
                           node_color=[color[v] for v in giant], cmap="tab10" if len(parts) <= 10 else "tab20",
                           vmin=0, vmax=9 if len(parts) <= 10 else 19, edgecolors="white", linewidths=0.8, ax=ax)
    ax.set_title(f"コミュニティ（Girvan-Newman 法）: {len(parts)} 個、モジュラリティ {q:.2f}")
    fig.savefig(OUT / "4-communities.png", dpi=160, bbox_inches="tight")
    plt.close(fig)

    inside = sum(1 for a, b in giant.edges() if color[a] == color[b])
    lines += [
        "",
        "## コミュニティ（最大の島、Girvan-Newman 法）",
        f"- {len(parts)} 個に分かれる。人数は {'、'.join(str(len(p)) for p in parts)}",
        f"- モジュラリティ {q:.3f}（0.3 を超えると、はっきり固まりがあると言われる）",
        f"- フレンドの組のうち、同じ固まりの中にあるもの: {inside / giant.number_of_edges():.0%}",
    ]

    (OUT / "summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\n図と summary.md を {OUT} に出しました")


if __name__ == "__main__":
    main()
