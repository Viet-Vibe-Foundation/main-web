'use client'

import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EditEventSectionMeta = {
  id: string
  step: string
  label: string
  optional?: boolean
  complete?: boolean
}

interface EditEventSectionProps {
  meta: EditEventSectionMeta
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
  description?: React.ReactNode
}

export default function EditEventSection({
  meta,
  isOpen,
  onToggle,
  children,
  description,
}: EditEventSectionProps) {
  return (
    <section
      id={`edit-event-${meta.id}`}
      className="scroll-mt-24 rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-slate-50 md:px-5"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-500">
              Step {meta.step}
            </span>
            {meta.optional && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                Optional
              </span>
            )}
            {typeof meta.complete === 'boolean' && (
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium',
                  meta.complete
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-800'
                )}
              >
                {meta.complete ? 'Done' : 'Needed'}
              </span>
            )}
          </div>
          <h2 className="mt-1 text-lg font-bold md:text-xl">{meta.label}</h2>
        </div>
        <ChevronDown
          className={cn(
            'h-5 w-5 shrink-0 text-gray-500 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-5 md:px-5">
          {description}
          {children}
        </div>
      )}
    </section>
  )
}
