/**
 * Split issued-ticket QR attachments between the purchaser and other guests.
 *
 * Ticket order follows the purchase: index 0 belongs to the purchaser and
 * index N (N >= 1) belongs to the Nth guest in `otherGuestsInfo`.
 *
 * `guestSlots` lists the ticket index claimed by each guest recipient that
 * will actually receive an email (guests without an email or duplicates are
 * simply left out). Every ticket nobody claims goes to the purchaser, so no
 * QR code is ever lost.
 */
export function splitQrAttachments<T>(
  attachments: T[],
  guestSlots: number[]
): { purchaser: T[]; guests: T[][] } {
  const claimed = new Set<number>()

  const guests = guestSlots.map((slot) => {
    const attachment = attachments[slot]
    if (slot < 1 || attachment === undefined || claimed.has(slot)) {
      return [] as T[]
    }
    claimed.add(slot)
    return [attachment]
  })

  const purchaser = attachments.filter((_, index) => !claimed.has(index))

  return { purchaser, guests }
}
