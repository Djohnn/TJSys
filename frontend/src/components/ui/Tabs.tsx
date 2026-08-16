import type { KeyboardEvent, ReactNode } from 'react'

export interface TabDefinition {
  id: string
  label: string
  disabled?: boolean
}

export interface TabsProps {
  tabs: readonly TabDefinition[]
  activeTab: string
  onChange: (tabId: string) => void
  children?: ReactNode
  className?: string
}

export function Tabs({ tabs, activeTab, onChange, children, className = '' }: TabsProps): ReactNode {
  const enabledTabs = tabs.filter((tab) => !tab.disabled)
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (enabledTabs.length === 0) return
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % enabledTabs.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + enabledTabs.length) % enabledTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = enabledTabs.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    document.getElementById(`tab-${enabledTabs[nextIndex].id}`)?.focus()
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label="Seções" className="flex min-h-11 gap-1 border-b border-[var(--color-border)]">
        {tabs.map((tab) => {
          const enabledIndex = enabledTabs.findIndex((enabledTab) => enabledTab.id === tab.id)
          const selected = tab.id === activeTab
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, enabledIndex)}
              className={`min-h-11 rounded-t-[var(--radius-md)] px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-800)] disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'text-[var(--color-primary-800)] underline decoration-2 underline-offset-8' : 'text-[var(--color-gray-600)] hover:bg-[var(--color-gray-100)]'}`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div id={`tabpanel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`} tabIndex={0} className="py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-800)]">
        {children}
      </div>
    </div>
  )
}

export default Tabs
