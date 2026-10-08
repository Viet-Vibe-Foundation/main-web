'use client'

import { useEffect, useState } from 'react'
import { Event } from '@prisma/client'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  getEventVoteForAdmin,
  saveEventVote,
  deleteEventVote,
} from '@/lib/actions/vote/eventVote'
import Loader from '@/components/loader/Loader'

interface EventVoteToolProps {
  event: Event
}

type OptionDraft = { id?: string; label: string }

export default function EventVoteTool({ event }: EventVoteToolProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [isEnabled, setIsEnabled] = useState(false)
  const [allowChangeVote, setAllowChangeVote] = useState(true)
  const [options, setOptions] = useState<OptionDraft[]>([
    { label: '' },
    { label: '' },
  ])
  const [ballotCount, setBallotCount] = useState(0)
  const [hasVote, setHasVote] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const vote = await getEventVoteForAdmin(event.id)
        if (vote) {
          setHasVote(true)
          setQuestion(vote.question)
          setDescription(vote.description || '')
          setIsEnabled(vote.isEnabled)
          setAllowChangeVote(vote.allowChangeVote)
          setOptions(
            vote.options.length >= 2
              ? vote.options.map((o) => ({ id: o.id, label: o.label }))
              : [{ label: '' }, { label: '' }]
          )
          setBallotCount(vote._count.ballots)
        }
      } catch (error) {
        console.error(error)
        toast.error('Failed to load vote settings')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [event.id])

  const onSave = async () => {
    setSaving(true)
    try {
      const result = await saveEventVote({
        eventId: event.id,
        question,
        description,
        isEnabled,
        allowChangeVote,
        options,
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to save')
        return
      }
      toast.success('Vote tool saved')
      setHasVote(true)
      const refreshed = await getEventVoteForAdmin(event.id)
      if (refreshed) {
        setOptions(
          refreshed.options.map((o) => ({ id: o.id, label: o.label }))
        )
        setBallotCount(refreshed._count.ballots)
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save vote tool'
      )
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (
      !confirm(
        ballotCount > 0
          ? `Delete this vote and all ${ballotCount} ballots?`
          : 'Delete this vote tool?'
      )
    ) {
      return
    }
    setSaving(true)
    try {
      const result = await deleteEventVote(event.id)
      if (!result.success) {
        toast.error(result.error || 'Failed to delete')
        return
      }
      setHasVote(false)
      setQuestion('')
      setDescription('')
      setIsEnabled(false)
      setAllowChangeVote(true)
      setOptions([{ label: '' }, { label: '' }])
      setBallotCount(0)
      toast.success('Vote tool removed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Let visitors vote for options you define. Each device and each logged-in
        account can vote once. Nicknames are shown in full; logged-in emails are
        partially masked publicly.
      </p>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            id="vote-enabled"
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
          />
          <Label htmlFor="vote-enabled">Show vote on event page</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="vote-allow-change"
            checked={allowChangeVote}
            onCheckedChange={setAllowChangeVote}
          />
          <Label htmlFor="vote-allow-change">Allow voters to change vote</Label>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="vote-question">Question</Label>
        <Input
          id="vote-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Which song should we play first?"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vote-description">Description (optional)</Label>
        <Textarea
          id="vote-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short instructions for voters"
          className="min-h-[80px]"
        />
      </div>

      <div className="space-y-3">
        <Label>Options</Label>
        {options.map((option, index) => (
          <div key={option.id || `new-${index}`} className="flex gap-2">
            <Input
              value={option.label}
              onChange={(e) => {
                const next = [...options]
                next[index] = { ...option, label: e.target.value }
                setOptions(next)
              }}
              placeholder={`Option ${index + 1}`}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={options.length <= 2}
              onClick={() =>
                setOptions(options.filter((_, i) => i !== index))
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOptions([...options, { label: '' }])}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add option
        </Button>
      </div>

      {ballotCount > 0 && (
        <p className="text-sm text-amber-700">
          {ballotCount} ballot{ballotCount === 1 ? '' : 's'} already cast.
          Options with votes cannot be removed.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={saving} onClick={() => void onSave()}>
          {saving ? 'Saving…' : 'Save vote tool'}
        </Button>
        {hasVote && (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => void onDelete()}
          >
            Delete vote tool
          </Button>
        )}
      </div>
    </div>
  )
}
