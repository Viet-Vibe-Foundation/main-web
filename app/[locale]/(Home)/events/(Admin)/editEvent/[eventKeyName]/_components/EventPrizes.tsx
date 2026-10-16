'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { axiosInstance } from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import Loader from '@/components/loader/Loader'
import {
  deleteEventPrize,
  getEventPrizeAdminState,
  saveEventPrize,
  type AdminEventPrize,
  type PrizeSponsorOption,
} from '@/lib/actions/prize/eventPrizes'

interface EventPrizesProps {
  eventId: string
}

type PrizeDraft = {
  id?: string
  title: string
  description: string
  imageUrl: string
  sponsorId: string
  order: number
  isPublished: boolean
}

const emptyPrize = (order: number): PrizeDraft => ({
  title: '',
  description: '',
  imageUrl: '',
  sponsorId: '',
  order,
  isPublished: true,
})

export default function EventPrizes({ eventId }: EventPrizesProps) {
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [prizes, setPrizes] = useState<PrizeDraft[]>([])
  const [sponsors, setSponsors] = useState<PrizeSponsorOption[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const state = await getEventPrizeAdminState(eventId)
      if (!state) {
        toast.error('You do not have access to edit prizes')
        return
      }
      setSponsors(state.sponsors)
      setPrizes(state.prizes.map(toDraft))
    } catch (error) {
      console.error(error)
      toast.error('Failed to load prizes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const updatePrize = (index: number, patch: Partial<PrizeDraft>) => {
    setPrizes((current) =>
      current.map((prize, prizeIndex) =>
        prizeIndex === index ? { ...prize, ...patch } : prize
      )
    )
  }

  const uploadImage = async (index: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await axiosInstance.post('/api/events/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    updatePrize(index, { imageUrl: response.data.url })
    toast.success('Prize image uploaded')
  }

  const onSave = async (prize: PrizeDraft) => {
    setSavingId(prize.id || 'new')
    try {
      const result = await saveEventPrize({
        eventId,
        id: prize.id,
        title: prize.title,
        description: prize.description,
        imageUrl: prize.imageUrl,
        sponsorId: prize.sponsorId,
        order: prize.order,
        isPublished: prize.isPublished,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Prize saved')
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Failed to save prize')
    } finally {
      setSavingId(null)
    }
  }

  const onDelete = async (prize: PrizeDraft, index: number) => {
    if (!prize.id) {
      setPrizes((current) => current.filter((_, prizeIndex) => prizeIndex !== index))
      return
    }
    const result = await deleteEventPrize(eventId, prize.id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Prize removed')
    await load()
  }

  if (loading) return <Loader />

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        These gifts appear next to the buy-ticket button and in the Amazing
        Prizes section. Link a sponsor to show their logo on the prize.
      </p>
      {prizes.map((prize, index) => (
        <div key={prize.id || `new-${index}`} className="space-y-3 rounded-lg border p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Prize title</Label>
              <Input
                value={prize.title}
                onChange={(event) => updatePrize(index, { title: event.target.value })}
                placeholder="Weekend getaway"
              />
            </div>
            <div className="space-y-1">
              <Label>Sponsor</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={prize.sponsorId}
                onChange={(event) =>
                  updatePrize(index, { sponsorId: event.target.value })
                }
              >
                <option value="">No sponsor logo</option>
                {sponsors.map((sponsor) => (
                  <option key={sponsor.id} value={sponsor.id}>
                    {sponsor.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={prize.description}
              onChange={(event) =>
                updatePrize(index, { description: event.target.value })
              }
              placeholder="What the winner receives"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_120px]">
            <div className="space-y-1">
              <Label>Prize image</Label>
              <Input
                value={prize.imageUrl}
                onChange={(event) =>
                  updatePrize(index, { imageUrl: event.target.value })
                }
                placeholder="https://"
              />
              <Input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void uploadImage(index, file)
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Order</Label>
              <Input
                type="number"
                min={0}
                value={prize.order}
                onChange={(event) =>
                  updatePrize(index, { order: Number(event.target.value) })
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={prize.isPublished}
              onCheckedChange={(checked) =>
                updatePrize(index, { isPublished: checked })
              }
            />
            <Label>Show on the event page</Label>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => void onSave(prize)}
              disabled={savingId !== null}
            >
              Save prize
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onDelete(prize, index)}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => setPrizes((current) => [...current, emptyPrize(current.length)])}
      >
        Add prize
      </Button>
    </div>
  )
}

function toDraft(prize: AdminEventPrize): PrizeDraft {
  return {
    id: prize.id,
    title: prize.title,
    description: prize.description || '',
    imageUrl: prize.imageUrl || '',
    sponsorId: prize.sponsorId || '',
    order: prize.order,
    isPublished: prize.isPublished,
  }
}
