'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Event } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Pencil } from 'lucide-react'
import { getCurrentDateTime } from '@/lib/actions/date/getCurrentDateTime'
import { cn } from '@/lib/utils'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { axiosInstance } from '@/lib/axios'
import Loader from '@/components/loader/Loader'
import {
  CONFIRMATION_EMAIL_PLACEHOLDERS,
  DEFAULT_CONFIRMATION_EMAIL_BODY,
  DEFAULT_CONFIRMATION_EMAIL_SUBJECT,
  filterPlaceholders,
  getOpenPlaceholderQuery,
  type ConfirmationEmailPlaceholder,
} from '@/lib/actions/email/confirmationEmailTemplate'

interface EventConfirmationEmailProps {
  event: Event
}

const schema = z.object({
  confirmationEmailSubject: z.string().max(200),
  confirmationEmailBody: z.string().max(20000),
})

type InsertTarget = 'subject' | 'body'
type FieldName = 'confirmationEmailSubject' | 'confirmationEmailBody'

type SuggestionState = {
  target: InsertTarget
  query: string
  /** Start index of the open `<<...` fragment being typed */
  replaceFrom: number
  replaceTo: number
  activeIndex: number
} | null

const EventConfirmationEmail = ({ event }: EventConfirmationEmailProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const currentDateTime = getCurrentDateTime()
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const subjectRef = useRef<HTMLInputElement | null>(null)
  const [insertTarget, setInsertTarget] = useState<InsertTarget>('body')
  const [dropdownValue, setDropdownValue] = useState<string>('')
  const [suggestion, setSuggestion] = useState<SuggestionState>(null)

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      confirmationEmailSubject: event.confirmationEmailSubject || '',
      confirmationEmailBody: event.confirmationEmailBody || '',
    },
  })

  // The subject is plain text, so HTML-only fields are body-only.
  const placeholdersForTarget = useCallback(
    (target: InsertTarget) =>
      target === 'subject'
        ? CONFIRMATION_EMAIL_PLACEHOLDERS.filter(
            (p) => p.key !== 'qrCodes' && p.key !== 'formLink'
          )
        : CONFIRMATION_EMAIL_PLACEHOLDERS,
    []
  )

  const insertablePlaceholders = useMemo(
    () => placeholdersForTarget(insertTarget),
    [insertTarget, placeholdersForTarget]
  )

  const suggestionItems = useMemo(() => {
    if (!suggestion) return []
    return filterPlaceholders(
      suggestion.query,
      placeholdersForTarget(suggestion.target)
    )
  }, [suggestion, placeholdersForTarget])

  const applyTokenAtRange = useCallback(
    (
      target: InsertTarget,
      token: string,
      replaceFrom: number,
      replaceTo: number
    ) => {
      const fieldName: FieldName =
        target === 'subject'
          ? 'confirmationEmailSubject'
          : 'confirmationEmailBody'
      const el = target === 'subject' ? subjectRef.current : bodyRef.current
      const current = form.getValues(fieldName) || ''
      const next = current.slice(0, replaceFrom) + token + current.slice(replaceTo)
      form.setValue(fieldName, next, { shouldDirty: true })
      setSuggestion(null)

      requestAnimationFrame(() => {
        if (!el) return
        el.focus()
        const pos = replaceFrom + token.length
        el.setSelectionRange(pos, pos)
      })
    },
    [form]
  )

  const insertPlaceholder = useCallback(
    (token: string) => {
      const el =
        insertTarget === 'subject' ? subjectRef.current : bodyRef.current
      const fieldName: FieldName =
        insertTarget === 'subject'
          ? 'confirmationEmailSubject'
          : 'confirmationEmailBody'
      const current = form.getValues(fieldName) || ''
      const start = el?.selectionStart ?? current.length
      const end = el?.selectionEnd ?? current.length
      applyTokenAtRange(insertTarget, token, start, end)
    },
    [applyTokenAtRange, form, insertTarget]
  )

  const updateSuggestionsFromElement = useCallback(
    (target: InsertTarget, value: string, cursor: number | null) => {
      if (cursor === null || cursor === undefined) {
        setSuggestion(null)
        return
      }
      const open = getOpenPlaceholderQuery(value, cursor)
      if (!open) {
        setSuggestion(null)
        return
      }
      setSuggestion({
        target,
        query: open.query,
        replaceFrom: open.replaceFrom,
        replaceTo: open.replaceTo,
        activeIndex: 0,
      })
    },
    []
  )

  const acceptSuggestion = useCallback(
    (placeholder: ConfirmationEmailPlaceholder) => {
      if (!suggestion) {
        insertPlaceholder(placeholder.token)
        return
      }
      applyTokenAtRange(
        suggestion.target,
        placeholder.token,
        suggestion.replaceFrom,
        suggestion.replaceTo
      )
    },
    [applyTokenAtRange, insertPlaceholder, suggestion]
  )

  const onInsertFromDropdown = (key: string) => {
    const placeholder = CONFIRMATION_EMAIL_PLACEHOLDERS.find((p) => p.key === key)
    if (!placeholder) return
    insertPlaceholder(placeholder.token)
    setDropdownValue('')
  }

  const handleEditorKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (!suggestion || suggestionItems.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSuggestion((prev) =>
        prev
          ? {
              ...prev,
              activeIndex: (prev.activeIndex + 1) % suggestionItems.length,
            }
          : prev
      )
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSuggestion((prev) =>
        prev
          ? {
              ...prev,
              activeIndex:
                (prev.activeIndex - 1 + suggestionItems.length) %
                suggestionItems.length,
            }
          : prev
      )
      return
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      const chosen = suggestionItems[suggestion.activeIndex]
      if (chosen) {
        e.preventDefault()
        acceptSuggestion(chosen)
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setSuggestion(null)
    }
  }

  const loadDefaultTemplate = () => {
    form.setValue('confirmationEmailSubject', DEFAULT_CONFIRMATION_EMAIL_SUBJECT, {
      shouldDirty: true,
    })
    form.setValue('confirmationEmailBody', DEFAULT_CONFIRMATION_EMAIL_BODY, {
      shouldDirty: true,
    })
  }

  const clearTemplate = async () => {
    try {
      setIsLoading(true)
      await axiosInstance.put(`/api/events/edit/${event.id}`, {
        confirmationEmailSubject: null,
        confirmationEmailBody: null,
      })
      form.reset({
        confirmationEmailSubject: '',
        confirmationEmailBody: '',
      })
      toast.success('Confirmation email reset to the default template', {
        description: (
          <span style={{ color: 'var(--muted-foreground)' }}>
            {currentDateTime}
          </span>
        ),
        style: { color: '#22c55e' },
      })
      setIsEditing(false)
      router.refresh()
    } catch (error) {
      toast.error('Something went wrong', {
        description: (
          <div className="flex flex-col gap-1">
            <span>
              {error instanceof Error ? error.message : 'Please try again later'}
            </span>
            <span style={{ color: 'var(--muted-foreground)' }}>
              {currentDateTime}
            </span>
          </div>
        ),
        style: { color: '#ef4444' },
      })
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmit = async (data: z.infer<typeof schema>) => {
    try {
      setIsLoading(true)
      const subject = data.confirmationEmailSubject.trim()
      const body = data.confirmationEmailBody.trim()
      await axiosInstance.put(`/api/events/edit/${event.id}`, {
        confirmationEmailSubject: subject || null,
        confirmationEmailBody: body || null,
      })
      toast.success(
        body
          ? 'Confirmation email template saved'
          : 'Confirmation email cleared — default template will be used',
        {
          description: (
            <span style={{ color: 'var(--muted-foreground)' }}>
              {currentDateTime}
            </span>
          ),
          style: { color: '#22c55e' },
        }
      )
      setIsEditing(false)
      router.refresh()
    } catch (error) {
      toast.error('Something went wrong', {
        description: (
          <div className="flex flex-col gap-1">
            <span>
              {error instanceof Error ? error.message : 'Please try again later'}
            </span>
            <span style={{ color: 'var(--muted-foreground)' }}>
              {currentDateTime}
            </span>
          </div>
        ),
        style: { color: '#ef4444' },
      })
    } finally {
      setIsLoading(false)
    }
  }

  const hasCustomTemplate = Boolean(
    event.confirmationEmailBody?.trim() || event.confirmationEmailSubject?.trim()
  )

  const SuggestionMenu = ({ target }: { target: InsertTarget }) => {
    if (!suggestion || suggestion.target !== target || suggestionItems.length === 0) {
      return null
    }

    return (
      <div
        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg"
        role="listbox"
        aria-label="Field suggestions"
      >
        <div className="border-b border-slate-100 px-3 py-2 text-xs text-muted-foreground">
          Suggestions — Enter/Tab to insert, Esc to dismiss
        </div>
        {suggestionItems.map((item, index) => (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={index === suggestion.activeIndex}
            className={cn(
              'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-100',
              index === suggestion.activeIndex && 'bg-slate-100'
            )}
            onMouseDown={(e) => {
              // Prevent blur before click inserts
              e.preventDefault()
              acceptSuggestion(item)
            }}
          >
            <span className="font-medium text-gray-900">
              {item.label}{' '}
              <code className="text-xs text-red-700">{item.token}</code>
            </span>
            <span className="text-xs text-muted-foreground">
              {item.description}
            </span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <>
      {isLoading && <Loader />}
      <div className="flex flex-col gap-y-4 rounded-md bg-slate-50 px-4 py-6">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold">Ticket Confirmation Email</h3>
          <Button
            variant={null}
            onClick={() => setIsEditing(!isEditing)}
            disabled={isLoading}
            className={cn(
              isEditing
                ? 'font-semibold text-gray-700 transition-all duration-75 hover:text-red-700'
                : 'font-semibold text-red-700 transition-all duration-75 hover:text-gray-700'
            )}
          >
            {isEditing ? (
              'Cancel'
            ) : (
              <span className="flex gap-x-2">
                Edit <Pencil className="h-5 w-5" />
              </span>
            )}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Customize the email guests receive after buying a ticket. Insert
          auto-filled fields from the dropdown, or type{' '}
          <code className="rounded bg-slate-200 px-1">&lt;&lt;</code> to open
          suggestions. Leave blank to use the default VVF template.
        </p>

        {isEditing ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-sm font-medium">
                    Insert field into {insertTarget}
                  </label>
                  <Select
                    value={dropdownValue || undefined}
                    onValueChange={onInsertFromDropdown}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Choose a field to insert…" />
                    </SelectTrigger>
                    <SelectContent>
                      {insertablePlaceholders.map((placeholder) => (
                        <SelectItem key={placeholder.key} value={placeholder.key}>
                          {placeholder.label} — {placeholder.token}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={insertTarget === 'subject' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setInsertTarget('subject')
                      subjectRef.current?.focus()
                    }}
                  >
                    Subject
                  </Button>
                  <Button
                    type="button"
                    variant={insertTarget === 'body' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setInsertTarget('body')
                      bodyRef.current?.focus()
                    }}
                  >
                    Body
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="flex w-full items-center gap-1 text-xs text-muted-foreground">
                  Quick insert <ChevronDown className="h-3 w-3" />
                </span>
                {insertablePlaceholders.map((placeholder) => (
                  <Button
                    key={placeholder.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-white"
                    title={placeholder.description}
                    onClick={() => insertPlaceholder(placeholder.token)}
                  >
                    {placeholder.token}
                  </Button>
                ))}
              </div>

              <FormField
                name="confirmationEmailSubject"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          ref={(el) => {
                            field.ref(el)
                            subjectRef.current = el
                          }}
                          onFocus={() => setInsertTarget('subject')}
                          onBlur={() => {
                            // Delay so suggestion click can fire
                            setTimeout(() => {
                              if (suggestion?.target === 'subject') {
                                setSuggestion(null)
                              }
                            }, 150)
                          }}
                          onKeyDown={handleEditorKeyDown}
                          onChange={(e) => {
                            field.onChange(e)
                            updateSuggestionsFromElement(
                              'subject',
                              e.target.value,
                              e.target.selectionStart
                            )
                          }}
                          onClick={(e) => {
                            updateSuggestionsFromElement(
                              'subject',
                              e.currentTarget.value,
                              e.currentTarget.selectionStart
                            )
                          }}
                          onKeyUp={(e) => {
                            updateSuggestionsFromElement(
                              'subject',
                              e.currentTarget.value,
                              e.currentTarget.selectionStart
                            )
                          }}
                          className="bg-white p-2 text-gray-900"
                          placeholder={DEFAULT_CONFIRMATION_EMAIL_SUBJECT}
                          autoComplete="off"
                        />
                        <SuggestionMenu target="subject" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="confirmationEmailBody"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Body (HTML or plain text)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Textarea
                          {...field}
                          ref={(el) => {
                            field.ref(el)
                            bodyRef.current = el
                          }}
                          onFocus={() => setInsertTarget('body')}
                          onBlur={() => {
                            setTimeout(() => {
                              if (suggestion?.target === 'body') {
                                setSuggestion(null)
                              }
                            }, 150)
                          }}
                          onKeyDown={handleEditorKeyDown}
                          onChange={(e) => {
                            field.onChange(e)
                            updateSuggestionsFromElement(
                              'body',
                              e.target.value,
                              e.target.selectionStart
                            )
                          }}
                          onClick={(e) => {
                            updateSuggestionsFromElement(
                              'body',
                              e.currentTarget.value,
                              e.currentTarget.selectionStart
                            )
                          }}
                          onKeyUp={(e) => {
                            updateSuggestionsFromElement(
                              'body',
                              e.currentTarget.value,
                              e.currentTarget.selectionStart
                            )
                          }}
                          className="min-h-[280px] bg-white p-2 font-mono text-sm text-gray-900"
                          placeholder="Hi <<firstName>>, thanks for buying <<ticketType>>..."
                        />
                        <SuggestionMenu target="body" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isLoading}>
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  onClick={loadDefaultTemplate}
                >
                  Load starter template
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  onClick={() => void clearTemplate()}
                >
                  Use default email
                </Button>
              </div>
            </form>
          </Form>
        ) : !hasCustomTemplate ? (
          <p className="italic text-muted-foreground text-slate-500">
            Using the default confirmation email. Edit to create a custom
            template with auto-filled fields.
          </p>
        ) : (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="font-semibold text-gray-800">Subject: </span>
              {event.confirmationEmailSubject ||
                '(default subject with placeholders if body is set)'}
            </p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border bg-white p-3 text-xs text-gray-800">
              {event.confirmationEmailBody || '(empty body — default layout)'}
            </pre>
          </div>
        )}
      </div>
    </>
  )
}

export default EventConfirmationEmail
