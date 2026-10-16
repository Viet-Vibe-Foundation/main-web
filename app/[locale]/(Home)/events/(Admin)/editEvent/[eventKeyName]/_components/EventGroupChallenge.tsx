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
  getGroupChallengeForAdmin,
  saveGroupChallenge,
  type GroupChallengeReward,
} from '@/lib/actions/challenge/groupChallenge'
import ReferralStatsPanel from '@/app/[locale]/(Home)/profile/_components/ReferralStatsPanel'

interface EventGroupChallengeProps {
  eventId: string
}

const emptyReward = (place: number): GroupChallengeReward => ({
  place,
  title: '',
  description: '',
  imageUrl: '',
})

export default function EventGroupChallenge({ eventId }: EventGroupChallengeProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [title, setTitle] = useState('Group Challenge')
  const [description, setDescription] = useState('')
  const [rewards, setRewards] = useState<GroupChallengeReward[]>([
    emptyReward(1),
    emptyReward(2),
    emptyReward(3),
  ])
  const [endsAt, setEndsAt] = useState('')
  const [referralDiscountPercent, setReferralDiscountPercent] = useState(0)
  const [countOwnTickets, setCountOwnTickets] = useState(false)
  const [performerEmails, setPerformerEmails] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const challenge = await getGroupChallengeForAdmin(eventId)
        if (challenge) {
          setIsEnabled(challenge.isEnabled)
          setTitle(challenge.title)
          setDescription(challenge.description)
          if (challenge.rewards.length > 0) setRewards(challenge.rewards)
          setEndsAt(challenge.endsAt)
          setReferralDiscountPercent(challenge.referralDiscountPercent)
          setCountOwnTickets(challenge.countOwnTickets)
          setPerformerEmails(challenge.performerEmails)
        }
      } catch (error) {
        console.error(error)
        toast.error('Failed to load the group challenge')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [eventId])

  const updateReward = (index: number, patch: Partial<GroupChallengeReward>) => {
    setRewards((current) =>
      current.map((reward, rewardIndex) =>
        rewardIndex === index ? { ...reward, ...patch } : reward
      )
    )
  }

  const uploadRewardImage = async (index: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await axiosInstance.post('/api/events/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    updateReward(index, { imageUrl: response.data.url })
    toast.success('Reward image uploaded')
  }

  const onSave = async () => {
    setSaving(true)
    try {
      const result = await saveGroupChallenge({
        eventId,
        isEnabled,
        title,
        description,
        rewards,
        endsAt,
        referralDiscountPercent,
        countOwnTickets,
        performerEmails,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Group challenge saved')
    } catch (error) {
      console.error(error)
      toast.error('Failed to save the group challenge')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loader />

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Ticket holders, VVF members, volunteers, and the performer emails below
        can claim a code on the event page. Friends who buy with that code
        before the end time get the discount, and those tickets decide the winner.
        Names on the public board stay partly hidden.
      </p>
      <div className="flex items-center gap-2">
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
        <Label>Show the leaderboard on the event and ticket page</Label>
      </div>
      <div className="space-y-1">
        <Label>Leaderboard title</Label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Bowling night for 4, sponsored by Grandview Lanes."
          rows={6}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>End time (Pacific)</Label>
          <Input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Friend discount (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={referralDiscountPercent}
            onChange={(event) =>
              setReferralDiscountPercent(Number(event.target.value))
            }
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={countOwnTickets} onCheckedChange={setCountOwnTickets} />
        <Label>Also count the referrer&apos;s own tickets</Label>
      </div>
      <div className="space-y-1">
        <Label>Confirmed performer emails</Label>
        <Textarea
          value={performerEmails}
          onChange={(event) => setPerformerEmails(event.target.value)}
          placeholder="one email per line"
          rows={4}
        />
      </div>
      <div className="space-y-3">
        <Label>Rewards</Label>
        {rewards.map((reward, index) => (
          <div key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[80px_1fr]">
            <div className="space-y-1">
              <Label>Place</Label>
              <Input
                type="number"
                min={1}
                value={reward.place}
                onChange={(event) =>
                  updateReward(index, { place: Number(event.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Input
                value={reward.title}
                onChange={(event) => updateReward(index, { title: event.target.value })}
                placeholder="Reward title"
              />
              <Input
                value={reward.description}
                onChange={(event) =>
                  updateReward(index, { description: event.target.value })
                }
                placeholder="Short description"
              />
              <Input
                value={reward.imageUrl}
                onChange={(event) =>
                  updateReward(index, { imageUrl: event.target.value })
                }
                placeholder="Image URL"
              />
              <Input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void uploadRewardImage(index, file)
                }}
              />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setRewards((current) => [...current, emptyReward(current.length + 1)])
          }
        >
          Add reward
        </Button>
      </div>
      <Button type="button" onClick={() => void onSave()} disabled={saving}>
        {saving ? 'Saving...' : 'Save group challenge'}
      </Button>
      <ReferralStatsPanel eventId={eventId} />
    </div>
  )
}
