import type { ReactNode } from 'react'

interface Tab {
  key: string
  label: string
  disabled: boolean
}

interface ProductEditorStepsProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (key: string) => void
}

export default function ProductEditorSteps({ tabs, activeTab, onTabChange }: ProductEditorStepsProps): ReactNode {
  return (
    <nav role="tablist" data-testid="product-editor-steps" className="flex border-b border-border mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeTab === tab.key}
          aria-disabled={tab.disabled || undefined}
          disabled={tab.disabled}
          tabIndex={activeTab === tab.key ? 0 : -1}
          data-testid={`step-tab-${tab.key}`}
          onClick={() => {
            if (!tab.disabled) onTabChange(tab.key)
          }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === tab.key
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
          } ${tab.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
