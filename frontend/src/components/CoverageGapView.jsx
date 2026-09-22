import { useEffect, useMemo, useRef, useState } from 'react'

/** 列表摘录：压缩空白并截断，避免整段缺口撑爆列表 */
function excerpt(text, max = 140) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return '（空白字符）'
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

const pct = (r) => `${(r * 100).toFixed(1)}%`

/**
 * 覆盖缺口视图：列出当前文档中未被所选编码覆盖的连续文本区间。
 *
 * 数据来自 GET /api/documents/{id}/coverage-gaps：后端先跨编码合并重叠 /
 * 相邻的半开区间，再对全文求补集，文首、文尾与零标注场景都被正确保留。
 *  - 顶部显示最小缺口长度阈值（由父组件下发给后端过滤）与覆盖概览；
 *  - 上一处 / 下一处在缺口之间循环导航并自动定位到正文；
 *  - 点击缺口经 onLocateGap 切回正文并闪烁定位；
 *  - 「带入编码表单」经 onBringToForm 把整段缺口区间填入现有编码表单，
 *    提交仍走原有的冲突预览流程。
 */
export default function CoverageGapView({
  stats,
  loading,
  error,
  minLength,
  onMinLengthChange,
  onLocateGap,
  onBringToForm,
}) {
  const [cursor, setCursor] = useState(0)
  const itemRefs = useRef([])

  const gaps = stats?.gaps ?? []
  const docId = stats?.document_id ?? null

  // 文档 / 筛选 / 标注 / 阈值变化后结果刷新：光标回到第一个缺口
  useEffect(() => {
    setCursor(0)
  }, [docId, minLength, stats])

  // 上一处 / 下一处导航后把当前行滚动到缺口列表的可见区
  useEffect(() => {
    itemRefs.current[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  // 防御：删除标注等情况下缺口数量变少，把光标夹回合法范围
  useEffect(() => {
    if (gaps.length === 0) setCursor(0)
    else if (cursor >= gaps.length) setCursor(gaps.length - 1)
  }, [gaps, cursor])

  const hiddenCount = stats ? stats.gap_count - gaps.length : 0
  const current = gaps[cursor] ?? null

  function gotoGap(index) {
    const next = ((index % gaps.length) + gaps.length) % gaps.length
    setCursor(next)
    onLocateGap(gaps[next])
  }

  function edgeLabel(gap) {
    if (gap.start === 0) return '文首'
    if (gap.end === stats.document_length) return '文尾'
    return null
  }

  const summary = useMemo(() => {
    if (!stats) return null
    const uncovered = stats.document_length - stats.covered_char_count
    return { uncovered }
  }, [stats])

  return (
    <div className="gap-panel">
      <div className="gap-toolbar">
        <div className="gap-controls">
          <label className="gap-min-field">
            最小缺口长度
            <input
              type="number"
              min="0"
              value={minLength}
              onChange={(e) =>
                onMinLengthChange(Math.max(0, Number(e.target.value) || 0))
              }
              title="仅显示长度不小于该值的缺口（由后端过滤）"
            />
            字
          </label>
          <div className="gap-nav">
            <button
              type="button"
              disabled={gaps.length === 0}
              onClick={() => gotoGap(cursor - 1)}
              title="定位到上一处缺口（循环）"
            >
              ↑ 上一处
            </button>
            <span className="gap-nav-pos">
              {gaps.length > 0 ? `${cursor + 1} / ${gaps.length}` : '— / —'}
            </span>
            <button
              type="button"
              disabled={gaps.length === 0}
              onClick={() => gotoGap(cursor + 1)}
              title="定位到下一处缺口（循环）"
            >
              ↓ 下一处
            </button>
          </div>
        </div>
        {stats && (
          <p className="speaker-summary">
            全文 {stats.document_length} 字 · 已覆盖 {stats.covered_char_count} 字
            （{pct(stats.coverage_rate)}）· 未覆盖 {summary.uncovered} 字 ·
            缺口 {stats.gap_count} 段
            {minLength > 0 && `，其中 ${hiddenCount} 段短于 ${minLength} 字已隐藏`}
          </p>
        )}
        <p className="hint">
          口径：先跨编码合并重叠 / 相邻（首尾相接）的半开标注区间，再对全文求补集；
          半开区间相邻处不视为缺口。点击缺口切回正文闪烁定位，也可把整段缺口带入编码表单。
        </p>
      </div>

      {loading && <div className="cooc-status">覆盖缺口加载中…</div>}
      {!loading && error && <div className="cooc-status error">{error}</div>}

      {!loading && !error && stats && stats.gap_count === 0 && (
        <div className="gap-empty-full">
          <strong>✓ 已全覆盖</strong>
          <span>
            当前所选 {stats.codes.length} 个编码的标注已覆盖全文
            {stats.document_length} 字，没有覆盖缺口。
          </span>
        </div>
      )}
      {!loading && !error && stats && stats.gap_count > 0 && gaps.length === 0 && (
        <div className="cooc-status">
          共 {stats.gap_count} 段缺口，但均短于 {minLength} 字；调小最小缺口长度即可查看。
        </div>
      )}

      {!loading && !error && gaps.length > 0 && (
        <ul className="gap-list">
          {gaps.map((gap, i) => {
            const edge = edgeLabel(gap)
            const active = i === cursor
            return (
              <li
                key={`${gap.start}-${gap.end}`}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                className={active ? 'active' : ''}
              >
                <button
                  type="button"
                  className="gap-item"
                  title="点击切回正文并闪烁定位"
                  onClick={() => {
                    setCursor(i)
                    onLocateGap(gap)
                  }}
                >
                  <span className="gap-item-head">
                    <code>
                      [{gap.start}, {gap.end})
                    </code>
                    <em>{gap.length} 字</em>
                    {edge && <span className="gap-edge-tag">{edge}</span>}
                  </span>
                  <span className="gap-item-text">「{excerpt(gap.text)}」</span>
                </button>
                <button
                  type="button"
                  className="gap-bring-btn"
                  title="把整段缺口区间带入编码表单（提交仍走冲突预览）"
                  onClick={() => {
                    setCursor(i)
                    onBringToForm(gap)
                  }}
                >
                  带入编码表单
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {current && (
        <p className="hint gap-current-hint" aria-live="polite">
          当前缺口 [{current.start}, {current.end})，{current.length} 字；用上一处 / 下一处快速循环定位。
        </p>
      )}
    </div>
  )
}
