import { Suspense, lazy, useDeferredValue, useMemo, useState } from 'react'
import { acupoints, bodyRegions, meridians } from './data/acupoints'
import type { Acupoint, DisplayMode, Filters, SceneViewPreset } from './types'

const HumanScene = lazy(async () => {
  const module = await import('./components/HumanScene')
  return { default: module.HumanScene }
})

type FloatingPanel = 'search' | 'mode' | 'view' | 'detail' | 'library' | null

const defaultFilters: Filters = {
  keyword: '',
  meridian: 'all',
  bodyRegion: 'all',
}

const displayModeLabels: Record<DisplayMode, string> = {
  info: '穴位信息',
  acupuncture: '针灸演示',
  moxibustion: '艾灸演示',
}

const displayModeDescriptions: Record<DisplayMode, string> = {
  info: '查看定位、归经、主治与操作说明。',
  acupuncture: '演示进针方向、针体路径与局部反馈。',
  moxibustion: '演示热区、悬灸轨迹与灸感扩散。',
}

const viewPresetLabels: Record<Exclude<SceneViewPreset, 'focus'>, string> = {
  front: '正面',
  back: '背面',
  left: '左侧',
  right: '右侧',
}

function ControlIcon({ kind }: { kind: 'search' | 'mode' | 'view' | 'detail' | 'library' | 'marker' }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {kind === 'search' && (
        <>
          <circle cx="11" cy="11" r="5.5" {...common} />
          <path d="M16 16l3.5 3.5" {...common} />
        </>
      )}
      {kind === 'mode' && (
        <>
          <path d="M6 18V9" {...common} />
          <path d="M12 18V5" {...common} />
          <path d="M18 18v-7" {...common} />
          <circle cx="6" cy="8" r="1.8" {...common} />
          <circle cx="12" cy="13" r="1.8" {...common} />
          <circle cx="18" cy="10" r="1.8" {...common} />
        </>
      )}
      {kind === 'view' && (
        <>
          <path d="M3.5 12s3-5 8.5-5 8.5 5 8.5 5-3 5-8.5 5-8.5-5-8.5-5z" {...common} />
          <circle cx="12" cy="12" r="2.2" {...common} />
        </>
      )}
      {kind === 'detail' && (
        <>
          <rect x="5" y="4.5" width="14" height="15" rx="2.5" {...common} />
          <path d="M8.5 9h7" {...common} />
          <path d="M8.5 12.5h7" {...common} />
          <path d="M8.5 16h4.5" {...common} />
        </>
      )}
      {kind === 'library' && (
        <>
          <rect x="4.5" y="6" width="4.5" height="12" rx="1.5" {...common} />
          <rect x="9.75" y="4.5" width="4.5" height="13.5" rx="1.5" {...common} />
          <rect x="15" y="7.5" width="4.5" height="10.5" rx="1.5" {...common} />
        </>
      )}
      {kind === 'marker' && (
        <>
          <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5z" {...common} />
          <circle cx="12" cy="12" r="2.5" {...common} />
        </>
      )}
    </svg>
  )
}

function matchesKeyword(point: Acupoint, keyword: string) {
  if (!keyword.trim()) {
    return true
  }

  const normalized = keyword.trim().toLowerCase()
  return [
    point.name,
    ...point.aliases,
    point.meridian,
    point.summary,
    point.location,
    ...point.indications,
  ].some((value) => value.toLowerCase().includes(normalized))
}

function FloatingButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`floating-button ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
    >
      <span className="floating-button-icon">{icon}</span>
      <span className="floating-button-label">{label}</span>
    </button>
  )
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [displayMode, setDisplayMode] = useState<DisplayMode>('info')
  const [viewPreset, setViewPreset] = useState<SceneViewPreset>('front')
  const [showMarkers, setShowMarkers] = useState(true)
  const [selectedAcupointId, setSelectedAcupointId] = useState<string>('')
  const [hoveredAcupointId, setHoveredAcupointId] = useState<string | null>(null)
  const [procedureKey, setProcedureKey] = useState(0)
  const [activePanel, setActivePanel] = useState<FloatingPanel>(null)
  const deferredKeyword = useDeferredValue(filters.keyword)

  const filteredAcupoints = useMemo(
    () =>
      acupoints.filter((point) => {
        if (filters.meridian !== 'all' && point.meridian !== filters.meridian) {
          return false
        }

        if (filters.bodyRegion !== 'all' && point.bodyRegion !== filters.bodyRegion) {
          return false
        }

        return matchesKeyword(point, deferredKeyword)
      }),
    [deferredKeyword, filters.bodyRegion, filters.meridian],
  )

  const selectedAcupoint = useMemo(() => {
    if (!selectedAcupointId) {
      return null
    }

    return filteredAcupoints.find((point) => point.id === selectedAcupointId) ?? null
  }, [filteredAcupoints, selectedAcupointId])

  const selectedBodyRegionLabel =
    bodyRegions.find((region) => region.value === selectedAcupoint?.bodyRegion)?.label ?? '未分类'

  const relatedAcupoints = useMemo(() => {
    if (!selectedAcupoint) {
      return []
    }

    return filteredAcupoints
      .filter(
        (point) =>
          point.id !== selectedAcupoint.id &&
          (point.meridian === selectedAcupoint.meridian || point.bodyRegion === selectedAcupoint.bodyRegion),
      )
      .slice(0, 4)
  }, [filteredAcupoints, selectedAcupoint])

  const activeViewLabel =
    viewPreset === 'focus' ? `聚焦 ${selectedAcupoint?.name ?? '穴位'}` : viewPresetLabels[viewPreset]
  const modeThemeClass = `theme-${displayMode}`

  const handleSelectAcupoint = (id: string) => {
    setSelectedAcupointId(id)
    setViewPreset('focus')
    setProcedureKey((current) => current + 1)
    setActivePanel('detail')
  }

  const handleClearSelection = () => {
    setSelectedAcupointId('')
    setHoveredAcupointId(null)
    setViewPreset('front')
    setActivePanel(null)
  }

  const togglePanel = (panel: FloatingPanel) => {
    setActivePanel((current) => (current === panel ? null : panel))
  }

  return (
    <div className="page-shell">
      <main className="immersive-page">
        <section className="scene-panel" aria-label="3D 主场景">
          <div className="scene-frame">
            <div className="scene-backdrop-glow scene-backdrop-glow-a" />
            <div className="scene-backdrop-glow scene-backdrop-glow-b" />
            <div className="scene-grid" />

            <header className="top-bar">
              <div className="brand-card">
                <span className="eyebrow">Meridian Atlas</span>
                <h1>3D 经络穴位演示</h1>
                <p>用于展示人体穴位、针灸与艾灸动画路径。</p>
              </div>

              <div className="status-strip" aria-label="当前状态">
                <div className="status-chip">
                  <span>模式</span>
                  <strong>{displayModeLabels[displayMode]}</strong>
                </div>
                <div className="status-chip">
                  <span>视角</span>
                  <strong>{activeViewLabel}</strong>
                </div>
                <div className="status-chip">
                  <span>结果</span>
                  <strong>{filteredAcupoints.length} 个穴位</strong>
                </div>
              </div>
            </header>

            <aside className="control-dock" aria-label="场景控制">
              <FloatingButton
                active={activePanel === 'search'}
                icon={<ControlIcon kind="search" />}
                label="筛选"
                onClick={() => togglePanel('search')}
              />
              <FloatingButton
                active={activePanel === 'mode'}
                icon={<ControlIcon kind="mode" />}
                label="模式"
                onClick={() => togglePanel('mode')}
              />
              <FloatingButton
                active={activePanel === 'view'}
                icon={<ControlIcon kind="view" />}
                label="视角"
                onClick={() => togglePanel('view')}
              />
              <FloatingButton
                active={activePanel === 'detail'}
                icon={<ControlIcon kind="detail" />}
                label="详情"
                onClick={() => togglePanel('detail')}
              />
              <FloatingButton
                active={activePanel === 'library'}
                icon={<ControlIcon kind="library" />}
                label="穴位"
                onClick={() => togglePanel('library')}
              />
              <button
                type="button"
                className={`marker-toggle ${showMarkers ? 'is-active' : ''}`}
                onClick={() => setShowMarkers((current) => !current)}
                aria-pressed={showMarkers}
                title={showMarkers ? '隐藏点位' : '显示点位'}
              >
                <span className="floating-button-icon marker-toggle-icon">
                  <ControlIcon kind="marker" />
                </span>
                <span>{showMarkers ? '隐藏点位' : '显示点位'}</span>
              </button>
            </aside>

            {activePanel === 'search' && (
              <section className="floating-panel panel-search" aria-label="筛选与搜索">
                <div className="panel-header">
                  <div className="panel-title-block">
                    <span className="panel-overline">Search</span>
                    <h2>筛选与搜索</h2>
                  </div>
                  <button type="button" className="ghost-button" onClick={() => setFilters(defaultFilters)}>
                    重置
                  </button>
                </div>

                <div className="panel-stack">
                  <input
                    type="search"
                    className="floating-input"
                    placeholder="搜索穴位、别名、适应症"
                    value={filters.keyword}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        keyword: event.target.value,
                      }))
                    }
                  />

                  <div className="panel-grid">
                    <label className="field-group">
                      <span>经络</span>
                      <select
                        value={filters.meridian}
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            meridian: event.target.value as Filters['meridian'],
                          }))
                        }
                      >
                        <option value="all">全部经络</option>
                        {meridians.map((meridian) => (
                          <option key={meridian} value={meridian}>
                            {meridian}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-group">
                      <span>部位</span>
                      <select
                        value={filters.bodyRegion}
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            bodyRegion: event.target.value as Filters['bodyRegion'],
                          }))
                        }
                      >
                        <option value="all">全部部位</option>
                        {bodyRegions.map((region) => (
                          <option key={region.value} value={region.value}>
                            {region.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="panel-note">
                    当前结果 <strong>{filteredAcupoints.length}</strong> 个
                  </div>
                </div>
              </section>
            )}

            {activePanel === 'mode' && (
              <section className="floating-panel panel-mode" aria-label="展示模式">
                <div className="panel-header">
                  <div className="panel-title-block">
                    <span className="panel-overline">Mode</span>
                    <h2>展示模式</h2>
                  </div>
                </div>

                <div className="mode-stack">
                  {(['info', 'acupuncture', 'moxibustion'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`mode-card theme-${mode} ${displayMode === mode ? 'is-active' : ''}`}
                      onClick={() => setDisplayMode(mode)}
                    >
                      <span className="mode-card-line" />
                      <strong>{displayModeLabels[mode]}</strong>
                      <span>{displayModeDescriptions[mode]}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {activePanel === 'view' && (
              <section className="floating-panel panel-view" aria-label="视角控制">
                <div className="panel-header">
                  <div className="panel-title-block">
                    <span className="panel-overline">View</span>
                    <h2>预设视角</h2>
                  </div>
                </div>

                <div className="pill-group">
                  {(Object.keys(viewPresetLabels) as Array<Exclude<SceneViewPreset, 'focus'>>).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`pill ${viewPreset === preset ? 'is-active' : ''}`}
                      onClick={() => setViewPreset(preset)}
                    >
                      {viewPresetLabels[preset]}
                    </button>
                  ))}

                  <button
                    type="button"
                    className={`pill ${viewPreset === 'focus' ? 'is-active' : ''}`}
                    onClick={() => setViewPreset('focus')}
                    disabled={!selectedAcupoint}
                  >
                    聚焦穴位
                  </button>
                </div>
              </section>
            )}

            {activePanel === 'detail' && selectedAcupoint && (
              <aside className={`floating-panel panel-detail ${modeThemeClass}`} aria-label="穴位详情">
                <div className="panel-header">
                  <div className="panel-title-block">
                    <span className="panel-overline">Acupoint</span>
                    <h2>{selectedAcupoint.name}</h2>
                  </div>
                  <span className="panel-badge">{selectedAcupoint.aliases[0]}</span>
                </div>

                <div className="panel-accent-bar" />

                <p className="detail-summary">{selectedAcupoint.summary}</p>

                <dl className="info-grid">
                  <div>
                    <dt>所属经络</dt>
                    <dd>{selectedAcupoint.meridian}</dd>
                  </div>
                  <div>
                    <dt>身体部位</dt>
                    <dd>{selectedBodyRegionLabel}</dd>
                  </div>
                  <div>
                    <dt>定位说明</dt>
                    <dd>{selectedAcupoint.location}</dd>
                  </div>
                  <div>
                    <dt>操作建议</dt>
                    <dd>
                      {displayMode === 'moxibustion'
                        ? selectedAcupoint.moxibustion
                        : selectedAcupoint.acupuncture}
                    </dd>
                  </div>
                </dl>

                <div className="detail-section">
                  <h3>主治与应用</h3>
                  <div className="tag-list">
                    {selectedAcupoint.indications.map((item) => (
                      <span key={item} className="tag">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                {relatedAcupoints.length > 0 && (
                  <div className="detail-section">
                    <h3>相关穴位</h3>
                    <div className="related-strip">
                      {relatedAcupoints.map((point) => (
                        <button
                          key={point.id}
                          type="button"
                          className="related-item"
                          onClick={() => handleSelectAcupoint(point.id)}
                        >
                          <strong>{point.name}</strong>
                          <span>{point.meridian}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            )}

            {activePanel === 'library' && (
              <section className="floating-panel panel-library" aria-label="穴位列表">
                <div className="panel-header">
                  <div className="panel-title-block">
                    <span className="panel-overline">Library</span>
                    <h2>穴位列表</h2>
                  </div>
                  <span className="panel-badge">{filteredAcupoints.length} 个</span>
                </div>

                <div className="acupoint-strip" role="list" aria-label="穴位列表">
                  {filteredAcupoints.map((point) => (
                    <button
                      key={point.id}
                      type="button"
                      className={`strip-item ${selectedAcupoint?.id === point.id ? 'is-selected' : ''}`}
                      onClick={() => handleSelectAcupoint(point.id)}
                    >
                      <strong>{point.name}</strong>
                      <span>{point.aliases[0]}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {selectedAcupoint && (
              <section className={`scene-hud ${modeThemeClass}`} aria-label="当前穴位摘要">
                <span className="scene-hud-mode">{displayModeLabels[displayMode]}</span>
                <strong>{selectedAcupoint.name}</strong>
                <p className="scene-hud-summary">{selectedAcupoint.summary}</p>
                <div className="scene-hud-meta">
                  <span>{selectedAcupoint.aliases[0]}</span>
                  <span>{selectedAcupoint.meridian}</span>
                  <span>{selectedBodyRegionLabel}</span>
                </div>
              </section>
            )}

            {selectedAcupoint && relatedAcupoints.length > 0 && activePanel !== 'library' && (
              <div className="scene-related-rail" aria-label="快捷相关穴位">
                {relatedAcupoints.map((point) => (
                  <button
                    key={point.id}
                    type="button"
                    className="related-pill"
                    onClick={() => handleSelectAcupoint(point.id)}
                  >
                    <strong>{point.name}</strong>
                    <span>{point.aliases[0]}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="scene-canvas-hitbox">
              <Suspense fallback={<div className="scene-loading">3D 场景加载中...</div>}>
                <HumanScene
                  acupoints={filteredAcupoints}
                  selectedAcupoint={selectedAcupoint}
                  hoveredAcupointId={hoveredAcupointId}
                  displayMode={displayMode}
                  viewPreset={viewPreset}
                  showMarkers={showMarkers}
                  procedureKey={procedureKey}
                  onSelectAcupoint={handleSelectAcupoint}
                  onClearSelection={handleClearSelection}
                  onHoverAcupoint={setHoveredAcupointId}
                />
              </Suspense>
            </div>

            <div className="floating-legend" aria-label="图例">
              <span>
                <i className="legend-dot info" />
                穴位信息
              </span>
              <span>
                <i className="legend-dot acupuncture" />
                针灸演示
              </span>
              <span>
                <i className="legend-dot moxibustion" />
                艾灸演示
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
