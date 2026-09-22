"""覆盖缺口（coverage gap）统计的纯函数逻辑。

缺口指当前文档中**未被所选编码覆盖**的连续文本区间。统计口径与编码共现 /
说话人分析一致：
  1. 收集所选编码名下全部半开区间 [start, end)，跨编码合并所有互相重叠或
     首尾相接（相邻）的区间，得到全文上有序、互不相交的覆盖并集（同一编码
     自身的重叠标注、不同编码之间的重叠都不会被重复计数）；
  2. 在全文范围 [0, length) 上对覆盖并集求补集，得到同样有序、互不相交的
     非空缺口区间——
       - 首个覆盖区间不从 0 开始时，文首 [0, start) 为缺口；
       - 相邻覆盖区间之间的间隔（后段 start 大于前段 end）为缺口；
       - 末个覆盖区间未到达文末时，(end, length) 为文尾缺口；
       - 没有任何所选编码标注（零标注）时，整文 [0, length) 为唯一缺口。

注意：区间首尾相接（相邻）不产生缺口，因为半开区间之间没有遗漏的字符。
"""

from __future__ import annotations

from typing import Iterable, Sequence

from .cooccurrence import normalize_intervals


def covered_union(
    codings: Iterable[dict], code_ids: Sequence[int]
) -> list[tuple[int, int]]:
    """所选编码全部区间跨编码求并集（合并重叠 / 相邻），并裁剪到 [0, +∞)。"""
    wanted = set(code_ids)
    raw = [
        (max(0, c["start"]), c["end"])
        for c in codings
        if c["code_id"] in wanted and c["end"] > c["start"]
    ]
    return normalize_intervals(raw)


def complement_intervals(
    covered: Sequence[tuple[int, int]], length: int
) -> list[tuple[int, int]]:
    """有序、互不相交区间在全文 [0, length) 上的补集，返回非空缺口段。

    无论 covered 是否为空、是否覆盖文首 / 文尾，补集都恰好覆盖 [0, length)
    中未被覆盖的字符，不重不漏。
    """
    gaps: list[tuple[int, int]] = []
    cursor = 0
    for start, end in covered:
        if start >= length:
            break
        if start > cursor:
            gaps.append((cursor, start))
        if end > cursor:
            cursor = end
        if cursor >= length:
            break
    if cursor < length:
        gaps.append((cursor, length))
    return gaps


def _rate(part: int, whole: int) -> float:
    return round(part / whole, 4) if whole else 0.0


def compute_coverage_gaps(
    content: str,
    codings: Iterable[dict],
    code_ids: Sequence[int],
    min_length: int = 0,
) -> dict:
    """计算覆盖缺口并附带原文摘录。

    返回覆盖并集（含字符数 / 覆盖率）与全部缺口；gaps 仅保留长度 ≥
    min_length 的缺口，gap_count / gap_char_count 始终为过滤前的全量值，
    便于前端区分「已全覆盖」与「缺口均短于阈值」两种空状态。
    """
    length = len(content)
    covered = [(s, min(e, length)) for s, e in covered_union(codings, code_ids)]
    all_gaps = complement_intervals(covered, length)

    def segment(start: int, end: int) -> dict:
        return {
            "start": start,
            "end": end,
            "length": end - start,
            "text": content[start:end],
        }

    return {
        "document_length": length,
        "covered_char_count": sum(e - s for s, e in covered),
        "coverage_rate": _rate(sum(e - s for s, e in covered), length),
        "covered_intervals": [segment(s, e) for s, e in covered],
        "gap_count": len(all_gaps),
        "gap_char_count": sum(e - s for s, e in all_gaps),
        "gaps": [
            segment(s, e) for s, e in all_gaps if e - s >= min_length
        ],
    }
