import React, { useState } from 'react'
import {
  PresentationChartBarIcon,
  CodeBracketIcon,
  SwatchIcon,
  RocketLaunchIcon,
  ViewColumnsIcon,
  ComputerDesktopIcon,
  ShoppingBagIcon,
  PhotoIcon,
  BoltIcon,
  DevicePhoneMobileIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import {
  BRIEF_TEMPLATES,
  WEBSITE_TEMPLATES,
} from '../../lib/templates'

const ICON_MAP = {
  PresentationChartBarIcon,
  CodeBracketIcon,
  SwatchIcon,
  RocketLaunchIcon,
  ViewColumnsIcon,
  ComputerDesktopIcon,
  ShoppingBagIcon,
  PhotoIcon,
  BoltIcon,
  DevicePhoneMobileIcon,
}

export default function TemplatePicker({
  selectedBriefTemplate,
  selectedWebsiteTemplate,
  onSelectBrief,
  onSelectWebsite,
}) {
  const [activeTab, setActiveTab] = useState('brief')

  const templates = activeTab === 'brief' ? BRIEF_TEMPLATES : WEBSITE_TEMPLATES
  const selected = activeTab === 'brief' ? selectedBriefTemplate : selectedWebsiteTemplate
  const onSelect = activeTab === 'brief' ? onSelectBrief : onSelectWebsite

  return (
    <div style={{ width: '100%', fontFamily: 'var(--font-sans)' }}>
      {/* Tab switcher */}
      <div style={{
        display: 'flex',
        gap: 4,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-full)',
        padding: 3,
        marginBottom: 14,
        width: 'fit-content',
      }}>
        {[
          { id: 'brief', label: 'Brief Style' },
          { id: 'website', label: 'Website Structure' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 600,
              transition: 'var(--transition-fast)',
              background: activeTab === tab.id ? 'var(--color-card)' : 'transparent',
              color: activeTab === tab.id ? 'var(--color-text)' : 'var(--color-text-muted)',
              boxShadow: activeTab === tab.id ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 9,
      }}>
        {templates.map(tmpl => {
          const IconComp = ICON_MAP[tmpl.icon] || SwatchIcon
          const isSelected = selected === tmpl.id

          return (
            <button
              key={tmpl.id}
              onClick={() => onSelect(tmpl.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 8,
                padding: '13px 13px 11px',
                background: isSelected ? 'var(--color-card)' : 'var(--color-surface)',
                border: '1.5px solid ' + (isSelected ? tmpl.accent : 'var(--color-border)'),
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
                transition: 'var(--transition-fast)',
                boxShadow: isSelected ? '0 0 0 3px ' + tmpl.accent + '18' : 'none',
              }}
              onMouseEnter={e => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = tmpl.accent
                  e.currentTarget.style.background = 'var(--color-card)'
                }
              }}
              onMouseLeave={e => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.background = 'var(--color-surface)'
                }
              }}
            >
              {/* Selected check */}
              {isSelected && (
                <div style={{
                  position: 'absolute',
                  top: 9, right: 9,
                  width: 17, height: 17,
                  borderRadius: '50%',
                  background: tmpl.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <CheckIcon style={{ width: 9, height: 9, color: 'white' }} />
                </div>
              )}

              {/* Icon */}
              <div style={{
                width: 32, height: 32,
                borderRadius: 'var(--radius-md)',
                background: tmpl.accent + '15',
                border: '1px solid ' + tmpl.accent + '30',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <IconComp style={{ width: 15, height: 15, color: tmpl.accent }} />
              </div>

              {/* Name */}
              <div style={{
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '-0.02em',
                color: 'var(--color-text)',
                lineHeight: 1.2,
              }}>
                {tmpl.name}
              </div>

              {/* Tagline */}
              <div style={{
                fontSize: 11,
                fontWeight: 400,
                color: 'var(--color-text-muted)',
                lineHeight: 1.5,
              }}>
                {tmpl.tagline}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
