import { Suspense, lazy, useDeferredValue, useMemo, useState } from 'react'
import { acupoints, bodyRegions, meridians } from './data/acupoints'
import type { Acupoint, DisplayMode, Filters, SceneViewPreset } from './types'

const HumanScene = lazy(async () => {
  const module = await import('./components/HumanScene')
  return { default: module.HumanScene }
})

type DockPanelKey = 'meridian' | 'view' | 'detail' | 'library'

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
  info: '查看穴位定位、归经、主治与操作说明。',
  acupuncture: '突出进针方向、深度与针刺路径演示。',
  moxibustion: '突出热区范围、悬灸轨迹与热感扩散。',
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

function ModeIcon({ mode }: { mode: DisplayMode }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {mode === 'info' && (
        <>
          <circle cx="12" cy="8" r="2.7" {...common} />
          <path d="M12 11.7v5.1" {...common} />
          <path d="M9.8 16.8h4.4" {...common} />
          <path d="M6.2 18.5c1.4-2.6 3.4-3.9 5.8-3.9s4.4 1.3 5.8 3.9" {...common} />
        </>
      )}
      {mode === 'acupuncture' && (
        <>
          <path d="M5.5 18.5L18.5 5.5" {...common} />
          <path d="M15.7 5.5h2.8v2.8" {...common} />
          <path d="M4.7 19.3l2-.7-1.2-1.2z" {...common} />
          <path d="M9.8 14.2l1.8 1.8" {...common} />
        </>
      )}
      {mode === 'moxibustion' && (
        <>
          <path d="M12 4.8c1.5 1.8 3.2 3.7 3.2 5.9a3.2 3.2 0 1 1-6.4 0c0-2.2 1.7-4.1 3.2-5.9z" {...common} />
          <path d="M8.4 14.7c.9 1 2.1 1.5 3.6 1.5s2.7-.5 3.6-1.5" {...common} />
          <path d="M7.4 18.3h9.2" {...common} />
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

function PanelHeaderButton({
  active,
  expanded,
  icon,
  label,
  onClick,
}: {
  active: boolean
  expanded?: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`panel-header-button ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
    >
      <span className="panel-header-button-icon">{icon}</span>
      {typeof expanded === 'boolean' && (
        <span className={`panel-header-button-caret ${expanded ? 'is-open' : ''}`} aria-hidden="true">
          ▾
        </span>
      )}
    </button>
  )
}

export default function App() {
  const calibrationEnabled =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('calibrate') === '1'
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [displayMode, setDisplayMode] = useState<DisplayMode>('info')
  const [viewPreset, setViewPreset] = useState<SceneViewPreset>('front')
  const [showMarkers, setShowMarkers] = useState(true)
  const [selectedAcupointId, setSelectedAcupointId] = useState<string>('')
  const [hoveredAcupointId, setHoveredAcupointId] = useState<string | null>(null)
  const [procedureKey, setProcedureKey] = useState(0)
  const [openDockPanels, setOpenDockPanels] = useState<Record<DockPanelKey, boolean>>({
    meridian: true,
    view: true,
    detail: true,
    library: true,
  })
  const deferredKeyword = useDeferredValue(filters.keyword)

  const availableAcupoints = useMemo(
    () => (calibrationEnabled ? acupoints : acupoints.filter((point) => Boolean(point.surfaceAnchor))),
    [calibrationEnabled],
  )

  const filteredAcupoints = useMemo(
    () =>
      availableAcupoints.filter((point) => {
        if (filters.meridian !== 'all' && point.meridian !== filters.meridian) {
          return false
        }

        if (filters.bodyRegion !== 'all' && point.bodyRegion !== filters.bodyRegion) {
          return false
        }

        return matchesKeyword(point, deferredKeyword)
      }),
    [availableAcupoints, deferredKeyword, filters.bodyRegion, filters.meridian],
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
    viewPreset === 'focus' ? `聚焦 | ${selectedAcupoint?.name ?? '穴位'}` : viewPresetLabels[viewPreset]
  const modeThemeClass = `theme-${displayMode}`

  const handleSelectAcupoint = (id: string) => {
    setSelectedAcupointId(id)
    setViewPreset('focus')
    setProcedureKey((current) => current + 1)
  }

  const handleClearSelection = () => {
    setSelectedAcupointId('')
    setHoveredAcupointId(null)
    setViewPreset('front')
  }

  const toggleDockPanel = (panel: DockPanelKey) => {
    setOpenDockPanels((current) => ({
      ...current,
      [panel]: !current[panel],
    }))
  }

  return (
    <div className="page-shell">
      <main className="immersive-page">
        <section className="scene-panel" aria-label="3D 针灸艾灸场景">
          <div className="scene-frame">
            <div className="scene-backdrop-glow scene-backdrop-glow-a" />
            <div className="scene-backdrop-glow scene-backdrop-glow-b" />
            <div className="scene-grid" />

            <div className="stage-shell">
              <div className="stage-spotlight" />
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
            </div>

            <header className="page-header">
              <div className="hero-copy">
                <p className="hero-kicker">数字经络交互界面</p>
                <h1>
                  三维经络穴位
                  <span>专业演示界面</span>
                </h1>
              </div>

              <nav className="header-nav" aria-label="主导航">
                <button type="button" className="nav-button is-active">
                  首页
                </button>
                <button type="button" className="nav-button">
                  经络图谱
                </button>
                <button type="button" className="nav-button">
                  资料
                </button>
                <button type="button" className="nav-button">
                  关于
                </button>
                <button type="button" className="nav-button">
                  个人
                </button>
              </nav>
            </header>

            <div className="hero-layout">
              <aside className="sidebar sidebar-left">
                <div className="sidebar-left-stack">
                  <section className="panel-card mode-panel-left mode-panel-left-compact">
                    <div className="compact-panel-label">演示模式</div>

                    <div className="mode-button-row mode-button-row-compact" role="list" aria-label="演示模式列表">
                      {(['info', 'acupuncture', 'moxibustion'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`mode-chip mode-chip-compact theme-${mode} ${displayMode === mode ? 'is-active' : ''}`}
                          onClick={() => setDisplayMode(mode)}
                        >
                          <span className={`mode-chip-icon theme-${mode}`} aria-hidden="true">
                            <ModeIcon mode={mode} />
                          </span>
                          <strong>{displayModeLabels[mode]}</strong>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className={`panel-card mode-status-card mode-status-card-left ${modeThemeClass}`} aria-label="当前模式">
                    <div className="mode-status-main">
                      <span className={`mode-status-icon theme-${displayMode}`} aria-hidden="true">
                        <ModeIcon mode={displayMode} />
                      </span>
                      <div className="mode-status-copy">
                        <span className="scene-hud-mode">当前模式</span>
                        <strong>{displayModeLabels[displayMode]}</strong>
                        <span>{displayModeDescriptions[displayMode]}</span>
                      </div>
                    </div>
                  </section>
                </div>
              </aside>

              <section className="stage-column">
                <div className="stage-status-bar" aria-label="系统状态">
                  <span>
                    当前模式:
                    <strong>{displayModeLabels[displayMode]}</strong>
                  </span>
                  <span>
                    当前视角:
                    <strong>{activeViewLabel}</strong>
                  </span>
                  <span>
                    当前穴位:
                    <strong>{selectedAcupoint?.name ?? '未选择'}</strong>
                  </span>
                </div>

                {selectedAcupoint && (
                  <section className={`selection-summary ${modeThemeClass}`} aria-label="当前穴位摘要">
                    <div className="selection-summary-copy">
                      <strong>{selectedAcupoint.name}</strong>
                      <p className="scene-hud-summary">{selectedAcupoint.summary}</p>
                    </div>
                    <div className="scene-hud-meta">
                      <span>{selectedAcupoint.aliases[0]}</span>
                      <span>{selectedAcupoint.meridian}</span>
                      <span>{selectedBodyRegionLabel}</span>
                    </div>
                  </section>
                )}

                {relatedAcupoints.length > 0 && (
                  <section className="related-ribbon" aria-label="相关穴位">
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
                  </section>
                )}
              </section>

              <aside className="sidebar sidebar-right">
                <section className="panel-card right-dock-panel">
                  <div className="control-column">
                    <section className={`control-section control-card ${openDockPanels.meridian ? 'is-active' : ''}`}>
                      <div className="card-header">
                        <div className="card-title-group">
                          <span className="card-kicker">经络控制</span>
                          <h2>经络控制面板</h2>
                        </div>
                        <PanelHeaderButton
                          active={openDockPanels.meridian}
                          expanded={openDockPanels.meridian}
                          icon={<ControlIcon kind="detail" />}
                          label="展开或收起经络控制面板"
                          onClick={() => toggleDockPanel('meridian')}
                        />
                      </div>

                      <div className={`control-section-body ${openDockPanels.meridian ? 'is-open' : ''}`}>
                        <div className="meridian-chip-grid" role="list" aria-label="经络系统">
                          <button
                            type="button"
                            className={`meridian-chip ${filters.meridian === 'all' ? 'is-active' : ''}`}
                            onClick={() =>
                              setFilters((current) => ({
                                ...current,
                                meridian: 'all',
                              }))
                            }
                          >
                            全部
                          </button>
                          {meridians.slice(0, 10).map((meridian) => (
                            <button
                              key={meridian}
                              type="button"
                              className={`meridian-chip ${filters.meridian === meridian ? 'is-active' : ''}`}
                              onClick={() =>
                                setFilters((current) => ({
                                  ...current,
                                  meridian,
                                }))
                              }
                            >
                              {meridian}
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>

                    <section className={`control-section control-card ${openDockPanels.view ? 'is-active' : ''}`}>
                      <div className="card-header">
                        <div className="card-title-group">
                          <span className="card-kicker">视图控制</span>
                          <h2>视角与显示</h2>
                        </div>
                        <PanelHeaderButton
                          active={openDockPanels.view}
                          expanded={openDockPanels.view}
                          icon={<ControlIcon kind="view" />}
                          label="展开或收起视角与显示"
                          onClick={() => toggleDockPanel('view')}
                        />
                      </div>

                      <div className={`control-section-body ${openDockPanels.view ? 'is-open' : ''}`}>
                        <div className="view-button-grid">
                          {(Object.keys(viewPresetLabels) as Array<Exclude<SceneViewPreset, 'focus'>>).map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className={`view-card ${viewPreset === preset ? 'is-active' : ''}`}
                              onClick={() => setViewPreset(preset)}
                            >
                              {viewPresetLabels[preset]}
                            </button>
                          ))}
                          <button
                            type="button"
                            className={`view-card ${viewPreset === 'focus' ? 'is-active' : ''}`}
                            onClick={() => setViewPreset('focus')}
                            disabled={!selectedAcupoint}
                          >
                            聚焦
                          </button>
                        </div>

                        <div className="toggle-row">
                          <span>显示穴位标记</span>
                          <button
                            type="button"
                            className={`toggle-pill ${showMarkers ? 'is-on' : ''}`}
                            onClick={() => setShowMarkers((current) => !current)}
                            aria-pressed={showMarkers}
                          >
                            <span />
                          </button>
                        </div>

                        <div className="toggle-row">
                          <span>聚焦当前穴位</span>
                          <button
                            type="button"
                            className={`toggle-pill ${viewPreset === 'focus' ? 'is-on' : ''}`}
                            onClick={() => setViewPreset(selectedAcupoint ? 'focus' : 'front')}
                            aria-pressed={viewPreset === 'focus'}
                            disabled={!selectedAcupoint}
                          >
                            <span />
                          </button>
                        </div>
                      </div>
                    </section>

                    {selectedAcupoint && (
                      <section className={`control-section detail-card ${modeThemeClass} ${openDockPanels.detail ? 'is-active' : ''}`}>
                        <div className="card-header">
                          <div className="card-title-group">
                            <span className="card-kicker">当前穴位</span>
                            <h2>{selectedAcupoint.name}</h2>
                          </div>
                          <div className="section-header-actions">
                            <button type="button" className="ghost-button" onClick={handleClearSelection}>
                              清除
                            </button>
                            <PanelHeaderButton
                              active={openDockPanels.detail}
                              expanded={openDockPanels.detail}
                              icon={<ControlIcon kind="detail" />}
                              label="展开或收起当前穴位"
                              onClick={() => toggleDockPanel('detail')}
                            />
                          </div>
                        </div>

                        <div className={`control-section-body ${openDockPanels.detail ? 'is-open' : ''}`}>
                          <p className="detail-summary">{selectedAcupoint.summary}</p>

                          <dl className="info-grid">
                            <div>
                              <dt>别名</dt>
                              <dd>{selectedAcupoint.aliases[0]}</dd>
                            </div>
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
                          </dl>

                          <div className="detail-section">
                            <h3>主治与应用</h3>
                            <div className="tag-list">
                              {selectedAcupoint.indications.slice(0, 6).map((item) => (
                                <span key={item} className="tag">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </section>
                    )}

                    <section className={`control-section library-card ${openDockPanels.library ? 'is-active' : ''}`}>
                      <div className="card-header">
                        <div className="card-title-group">
                          <span className="card-kicker">穴位库</span>
                          <h2>穴位库</h2>
                        </div>
                        <PanelHeaderButton
                          active={openDockPanels.library}
                          expanded={openDockPanels.library}
                          icon={<ControlIcon kind="library" />}
                          label="展开或收起穴位库"
                          onClick={() => toggleDockPanel('library')}
                        />
                      </div>

                      <div className={`control-section-body ${openDockPanels.library ? 'is-open' : ''}`}>
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
                      </div>
                    </section>
                  </div>
                </section>
              </aside>
            </div>

            <footer className="scene-footer">
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
            </footer>
          </div>
        </section>
      </main>
    </div>
  )
}
