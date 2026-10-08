'use client'

import React, { useRef, useState } from 'react'
import { Event } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
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
import { axiosInstance } from '@/lib/axios'
import Loader from '@/components/loader/Loader'
import {
  CONFIRMATION_EMAIL_PLACEHOLDERS,
  DEFAULT_CONFIRMATION_EMAIL_BODY,
  DEFAULT_CONFIRMATION_EMAIL_SUBJECT,
} from '@/lib/actions/email/confirmationEmailTemplate'

interface EventConfirmationEmailProps {
  event: Event
}

const schema = z.object({
  confirmationEmailSubject: z.string().max(200),
  confirmationEmailBody: z.string().max(20000),
})

const EventConfirmationEmail = ({ event }: EventConfirmationEmailProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const currentDateTime = getCurrentDateTime()
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const subjectRef = useRef<HTMLInputElement | null>(null)
  const [insertTarget, setInsertTarget] = useState<'subject' | 'body'>('body')

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      confirmationEmailSubject: event.confirmationEmailSubject || '',
      confirmationEmailBody: event.confirmationEmailBody || '',
    },
  })

  const insertPlaceholder = (token: string) => {
    if (insertTarget === 'subject') {
      const input = subjectRef.current
      const current = form.getValues('confirmationEmailSubject') || ''
      if (!input) {
        form.setValue('confirmationEmailSubject', `${current}${token}`, {
          shouldDirty: true,
        })
        return
      }
      const start = input.selectionStart ?? current.length
      const end = input.selectionEnd ?? current.length
      const next = current.slice(0, start) + token + current.slice(end)
      form.setValue('confirmationEmailSubject', next, { shouldDirty: true })
      requestAnimationFrame(() => {
        input.focus()
        const pos = start + token.length
        input.setSelectionRange(pos, pos)
      })
      return
    }

    const textarea = bodyRef.current
    const current = form.getValues('confirmationEmailBody') || ''
    if (!textarea) {
      form.setValue('confirmationEmailBody', `${current}${token}`, {
        shouldDirty: true,
      })
      return
    }
    const start = textarea.selectionStart ?? current.length
    const end = textarea.selectionEnd ?? current.length
    const next = current.slice(0, start) + token + current.slice(end)
    form.setValue('confirmationEmailBody', next, { shouldDirty: true })
    requestAnimationFrame(() => {
      textarea.focus()
      const pos = start + token.length
      textarea.setSelectionRange(pos, pos)
    })
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
          Customize the email guests receive after buying a ticket. Use tokens
          like <code className="rounded bg-slate-200 px-1">&lt;&lt;firstName&gt;&gt;</code>{' '}
          — they are filled automatically at send time. Leave blank to use the
          default VVF template.
        </p>

        {isEditing ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <span className="w-full text-sm font-medium">
                  Insert field into {insertTarget}:
                </span>
                {CONFIRMATION_EMAIL_PLACEHOLDERS.map((placeholder) => (
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
                      <Input
                        {...field}
                        ref={(el) => {
                          field.ref(el)
                          subjectRef.current = el
                        }}
                        onFocus={() => setInsertTarget('subject')}
                        className="bg-white p-2 text-gray-900"
                        placeholder={DEFAULT_CONFIRMATION_EMAIL_SUBJECT}
                      />
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
                      <Textarea
                        {...field}
                        ref={(el) => {
                          field.ref(el)
                          bodyRef.current = el
                        }}
                        onFocus={() => setInsertTarget('body')}
                        className="min-h-[280px] bg-white p-2 font-mono text-sm text-gray-900"
                        placeholder="Hi <<firstName>>, thanks for buying <<ticketType>>..."
                      />
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
