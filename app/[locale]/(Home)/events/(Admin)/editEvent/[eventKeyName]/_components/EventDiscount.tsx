'use client'
import React, { useState, useEffect } from 'react'
import { Event } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { getCurrentDateTime } from '@/lib/actions/date/getCurrentDateTime'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormDescription,
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
import { AxiosError } from 'axios'
import Loader from '@/components/loader/Loader'
import {
  formatDiscountPercent,
  quantityRangeSchedule,
} from '@/lib/actions/price/quantityRangeDiscount'

// Discount type definition
type DiscountType =
  | 'Bulk Discount'
  | 'Minimum Total Discount'
  | 'Code Discount'
  | 'Quantity Range Discount'

// Discount data structure
interface EventDiscount {
  id: string
  type: DiscountType
  discountAmount: number
  discountUnit: 'percentage' | 'amount'
  minQuantity?: number // Bulk Discount, or the low end of a Quantity Range Discount
  maxQuantity?: number // High end of a Quantity Range Discount
  minDiscountPercent?: number
  maxDiscountPercent?: number
  minTotal?: number // Only for Minimum Total Discount
  code?: string // Only for Code Discount
  maxUses?: number // Only for Code Discount. Maximum tickets this code can discount. Omit for unlimited.
  cannotBeStacked?: boolean // If true, this discount cannot be combined with other discounts
}

interface EventDiscountsProps {
  event: Event
}

// Schema for discount form
const eventDiscountSchema = z
  .object({
    type: z.enum([
      'Bulk Discount',
      'Minimum Total Discount',
      'Code Discount',
      'Quantity Range Discount',
    ]),
    discountAmount: z.coerce.number().min(0, 'Discount amount must be at least 0'),
    discountUnit: z.enum(['percentage', 'amount']),
    minQuantity: z.coerce.number().min(1, 'Minimum quantity must be at least 1').optional().nullable(),
    maxQuantity: z.coerce.number().min(2, 'Maximum tickets must be at least 2').optional().nullable(),
    minDiscountPercent: z.coerce
      .number()
      .min(0, 'Discount must be at least 0')
      .max(100, 'Discount cannot exceed 100')
      .optional()
      .nullable(),
    maxDiscountPercent: z.coerce
      .number()
      .min(0, 'Discount must be at least 0')
      .max(100, 'Discount cannot exceed 100')
      .optional()
      .nullable(),
    minTotal: z.coerce.number().min(0, 'Minimum total must be at least 0').optional().nullable(),
    code: z.string().min(1, 'Code is required').optional().nullable(),
    maxUses: z
      .union([
        z.null(),
        z.coerce
          .number()
          .int('Maximum tickets must be a whole number')
          .min(1, 'Maximum tickets must be at least 1'),
      ])
      .optional(),
    cannotBeStacked: z.boolean().default(false),
  })
  .refine(
    (data) => {
      // If type is "Bulk Discount", minQuantity is required
      if (data.type === 'Bulk Discount') {
        return data.minQuantity !== null && data.minQuantity !== undefined && data.minQuantity >= 1
      }
      return true
    },
    {
      message: 'Minimum quantity is required for Bulk Discount',
      path: ['minQuantity'],
    }
  )
  .refine(
    (data) => {
      // If type is "Minimum Total Discount", minTotal is required
      if (data.type === 'Minimum Total Discount') {
        return data.minTotal !== null && data.minTotal !== undefined && data.minTotal >= 0
      }
      return true
    },
    {
      message: 'Minimum total is required for Minimum Total Discount',
      path: ['minTotal'],
    }
  )
  .refine(
    (data) => {
      // If type is "Code Discount", code is required
      if (data.type === 'Code Discount') {
        return data.code !== null && data.code !== undefined && data.code.trim().length > 0
      }
      return true
    },
    {
      message: 'Code is required for Code Discount',
      path: ['code'],
    }
  )
  .refine(
    (data) => {
      // If unit is "percentage", amount must be at most 100
      if (
        data.type !== 'Quantity Range Discount' &&
        data.discountUnit === 'percentage'
      ) {
        return data.discountAmount <= 100
      }
      return true
    },
    {
      message: 'Percentage must be at most 100',
      path: ['discountAmount'],
    }
  )
  .refine(
    (data) => {
      if (data.type !== 'Quantity Range Discount') return true
      return (
        data.minQuantity != null &&
        data.minQuantity >= 2 &&
        data.maxQuantity != null &&
        data.maxQuantity > data.minQuantity &&
        data.minDiscountPercent != null &&
        data.maxDiscountPercent != null &&
        data.maxDiscountPercent > data.minDiscountPercent
      )
    },
    {
      message:
        'Set a higher ticket count and a higher percent than the starting tier',
      path: ['maxQuantity'],
    }
  )

type EventDiscountFormData = z.infer<typeof eventDiscountSchema>

const EventDiscounts = ({ event }: EventDiscountsProps) => {
  const router = useRouter()
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const currentDateTime = getCurrentDateTime()
  const discounts =
    ((event.eventDiscounts as unknown as EventDiscount[] | null) || []).concat(
      (event.eventCodeDiscounts as unknown as EventDiscount[] | null) || []
    )

  // Form for EventDiscount
  const discountForm = useForm<EventDiscountFormData>({
    resolver: zodResolver(eventDiscountSchema),
    mode: 'all',
    defaultValues: {
      type: 'Bulk Discount',
      discountAmount: 0,
      discountUnit: 'percentage',
      minQuantity: null,
      maxQuantity: null,
      minDiscountPercent: null,
      maxDiscountPercent: null,
      minTotal: null,
      code: null,
      maxUses: null,
      cannotBeStacked: false,
    },
  })

  const discountType = discountForm.watch('type')
  const discountUnit = discountForm.watch('discountUnit')
  const minQuantity = discountForm.watch('minQuantity')
  const maxQuantity = discountForm.watch('maxQuantity')
  const minDiscountPercent = discountForm.watch('minDiscountPercent')
  const maxDiscountPercent = discountForm.watch('maxDiscountPercent')
  const rangePreview =
    discountType === 'Quantity Range Discount'
      ? quantityRangeSchedule({
          type: discountType,
          minQuantity,
          maxQuantity,
          minDiscountPercent,
          maxDiscountPercent,
        })
      : []

  const resetDiscountForm = () => {
    discountForm.reset({
      type: 'Bulk Discount',
      discountAmount: 0,
      discountUnit: 'percentage',
      minQuantity: null,
      maxQuantity: null,
      minDiscountPercent: null,
      maxDiscountPercent: null,
      minTotal: null,
      code: null,
      maxUses: null,
      cannotBeStacked: false,
    })
    setEditingDiscountId(null)
    setIsAddingNew(false)
  }

  const handleAddDiscountClick = () => {
    resetDiscountForm()
    setIsAddingNew(true)
  }

  const loadDiscountIntoForm = (discount: EventDiscount) => {
    // Handle backward compatibility: if percentage exists but discountAmount doesn't, use percentage
    const discountAmount = discount.discountAmount ?? 0
    const discountUnit = discount.discountUnit ?? 'percentage'
    
    discountForm.reset({
      type: discount.type,
      discountAmount: discountAmount,
      discountUnit: discountUnit,
      minQuantity: discount.minQuantity ?? null,
      maxQuantity: discount.maxQuantity ?? null,
      minDiscountPercent:
        discount.minDiscountPercent ??
        (discount.type === 'Quantity Range Discount' ? discountAmount : null),
      maxDiscountPercent: discount.maxDiscountPercent ?? null,
      minTotal: discount.minTotal ?? null,
      code: discount.code ?? null,
      maxUses: discount.maxUses ?? null,
      cannotBeStacked: discount.cannotBeStacked ?? false,
    })
    setEditingDiscountId(discount.id)
    setIsAddingNew(false)
  }

  // Handle discount submission
  const onDiscountSubmit = async (values: EventDiscountFormData) => {
    try {
      setIsLoading(true)

      // Create discount object
      const isQuantityRange = values.type === 'Quantity Range Discount'
      const discountData: EventDiscount = {
        id: editingDiscountId || `${event.keyName}--${values.type.toLowerCase().replace(' ', '-')}--${values.discountAmount}--${Date.now()}`,
        type: values.type,
        discountAmount: isQuantityRange
          ? (values.minDiscountPercent ?? 0)
          : values.discountAmount,
        discountUnit: isQuantityRange ? 'percentage' : values.discountUnit,
        minQuantity:
          values.type === 'Bulk Discount' || isQuantityRange
            ? values.minQuantity ?? undefined
            : undefined,
        maxQuantity: isQuantityRange ? values.maxQuantity ?? undefined : undefined,
        minDiscountPercent: isQuantityRange
          ? values.minDiscountPercent ?? undefined
          : undefined,
        maxDiscountPercent: isQuantityRange
          ? values.maxDiscountPercent ?? undefined
          : undefined,
        minTotal: values.type === 'Minimum Total Discount' ? values.minTotal ?? undefined : undefined,
        code: values.type === 'Code Discount' ? values.code ?? undefined : undefined,
        maxUses:
          values.type === 'Code Discount' &&
          values.maxUses !== null &&
          values.maxUses !== undefined
            ? values.maxUses
            : undefined,
        cannotBeStacked: isQuantityRange ? false : (values.cannotBeStacked ?? false),
      }

      // Update discounts array
      let updatedDiscounts: EventDiscount[]
      if (editingDiscountId) {
        // Update existing discount
        updatedDiscounts = discounts.map((d) =>
          d.id === editingDiscountId ? discountData : d
        )
      } else {
        // Add new discount
        updatedDiscounts = [...discounts, discountData]
      }

      // Save to database
      await axiosInstance.put(`/api/events/discounts/${event.id}`, {
        discounts: updatedDiscounts,
      })

      resetDiscountForm()

      toast.success(
        editingDiscountId ? 'Discount updated successfully' : 'Discount created successfully',
        {
          description: (
            <span style={{ color: 'var(--muted-foreground)' }}>
              {currentDateTime}
            </span>
          ),
          style: { color: '#22c55e' },
        }
      )

      router.refresh()
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        let errorMessage = 'An unknown error occurred'
        if (error.response?.data) {
          if (typeof error.response.data === 'string') {
            errorMessage = error.response.data
          } else if (
            typeof error.response.data === 'object' &&
            error.response.data !== null
          ) {
            errorMessage =
              (error.response.data as { message?: string }).message ||
              JSON.stringify(error.response.data)
          }
        } else if (error.message) {
          errorMessage = error.message
        }

        toast.error('Something went wrong', {
          description: (
            <div className="flex flex-col gap-1">
              <span>{errorMessage}</span>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {currentDateTime}
              </span>
            </div>
          ),
          style: { color: '#ef4444' },
        })
      } else if (error instanceof Error) {
        toast.error(error.message || 'Something went wrong', {
          description: (
            <div className="flex flex-col gap-1">
              <span>Error</span>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {currentDateTime}
              </span>
            </div>
          ),
          style: { color: '#ef4444' },
        })
      } else {
        toast.error('Error', {
          description: (
            <div className="flex flex-col gap-1">
              <span>Something went wrong. Please contact the admin.</span>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {currentDateTime}
              </span>
            </div>
          ),
          style: { color: '#ef4444' },
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (discountId: string) => {
    if (!confirm('Are you sure you want to delete this discount? This action cannot be undone.')) {
      return
    }

    try {
      setIsLoading(true)
      const updatedDiscounts = discounts.filter((d) => d.id !== discountId)

      await axiosInstance.put(`/api/events/discounts/${event.id}`, {
        discounts: updatedDiscounts,
      })

      toast.success('Discount deleted successfully', {
        description: (
          <span style={{ color: 'var(--muted-foreground)' }}>
            {currentDateTime}
          </span>
        ),
        style: { color: '#22c55e' },
      })

      router.refresh()
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        let errorMessage = 'An unknown error occurred'
        if (error.response?.data) {
          if (typeof error.response.data === 'string') {
            errorMessage = error.response.data
          } else if (
            typeof error.response.data === 'object' &&
            error.response.data !== null
          ) {
            errorMessage =
              (error.response.data as { message?: string }).message ||
              JSON.stringify(error.response.data)
          }
        } else if (error.message) {
          errorMessage = error.message
        }

        toast.error('Failed to delete discount', {
          description: (
            <div className="flex flex-col gap-1">
              <span>{errorMessage}</span>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {currentDateTime}
              </span>
            </div>
          ),
          style: { color: '#ef4444' },
        })
      } else if (error instanceof Error) {
        toast.error(error.message || 'Failed to delete discount', {
          description: (
            <div className="flex flex-col gap-1">
              <span>Error</span>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {currentDateTime}
              </span>
            </div>
          ),
          style: { color: '#ef4444' },
        })
      } else {
        toast.error('Error', {
          description: (
            <div className="flex flex-col gap-1">
              <span>Something went wrong. Please contact the admin.</span>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {currentDateTime}
              </span>
            </div>
          ),
          style: { color: '#ef4444' },
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const { isSubmitting: isDiscountSubmitting, isValid: isDiscountValid } =
    discountForm.formState
  const isEditingDiscount = editingDiscountId !== null || isAddingNew

  return (
    <>
      {isLoading && <Loader />}
      <div className="flex w-full flex-col gap-y-6 rounded-md bg-slate-50 px-4 py-6">
        {/* EventDiscounts section */}
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Event Discounts</h1>
            <div className="flex gap-x-2">
              {!isEditingDiscount && (
                <button
                  onClick={handleAddDiscountClick}
                  disabled={isLoading}
                  className="flex items-center gap-x-2 text-sm font-semibold text-[#C54B3E] transition-all hover:text-slate-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Discount
                </button>
              )}
            </div>
          </div>

          {/* Discount List */}
          {!isEditingDiscount && discounts.length > 0 && (
            <div className="flex flex-col gap-y-4">
              {discounts.map((discount) => (
                <div
                  key={discount.id}
                  className="flex items-center justify-between rounded-md border bg-white p-4"
                >
                  <div className="flex flex-col gap-y-1">
                    <div className="font-semibold">
                      {discount.type} - {(() => {
                        // Handle backward compatibility
                        const amount = discount.discountAmount ?? 0
                        const unit = discount.discountUnit ?? 'percentage'
                        return unit === 'percentage' ? `${amount}% off` : `$${amount} off`
                      })()}
                      {discount.type === 'Bulk Discount' && discount.minQuantity && (
                        <span className="text-sm font-normal text-muted-foreground">
                          {' '}
                          (Minimum {discount.minQuantity} items)
                        </span>
                      )}
                      {discount.type === 'Quantity Range Discount' &&
                        discount.minQuantity &&
                        discount.maxQuantity && (
                          <span className="text-sm font-normal text-muted-foreground">
                            {' '}
                            ({discount.minQuantity} tickets{' '}
                            {formatDiscountPercent(
                              discount.minDiscountPercent ?? discount.discountAmount
                            )}
                            % → {discount.maxQuantity} tickets{' '}
                            {formatDiscountPercent(discount.maxDiscountPercent ?? 0)}%)
                          </span>
                        )}
                      {discount.type === 'Minimum Total Discount' && discount.minTotal !== undefined && (
                        <span className="text-sm font-normal text-muted-foreground">
                          {' '}
                          (Minimum ${discount.minTotal})
                        </span>
                      )}
                      {discount.type === 'Code Discount' && discount.code && (
                        <span className="text-sm font-normal text-muted-foreground">
                          {' '}
                          {discount.maxUses != null
                            ? `(Code: ${discount.code}, max ${discount.maxUses} ticket${discount.maxUses === 1 ? '' : 's'})`
                            : `(Code: ${discount.code})`}
                        </span>
                      )}
                    </div>
                    {discount.cannotBeStacked && (
                      <div className="text-xs text-muted-foreground">
                        Cannot be stacked with others
                      </div>
                    )}
                  </div>
                  <div className="flex gap-x-2">
                    <button
                      onClick={() => loadDiscountIntoForm(discount)}
                      disabled={isLoading}
                      className="rounded p-2 hover:bg-gray-100"
                      title="Edit discount"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(discount.id)}
                      disabled={isLoading}
                      className="rounded p-2 text-red-600 hover:bg-red-50"
                      title="Delete discount"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isEditingDiscount && discounts.length === 0 && (
            <p className="text-sm italic text-muted-foreground text-slate-500">
              No discounts added yet. Click &quot;Add Discount&quot; to create one.
            </p>
          )}

          {/* Add/Edit Discount Form */}
          {isEditingDiscount && (
            <div className="rounded-md border bg-white p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {editingDiscountId ? 'Edit Discount' : 'Add New Discount'}
                </h3>
                <button
                  onClick={resetDiscountForm}
                  disabled={isLoading}
                  className="rounded p-1 hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <Form {...discountForm}>
                <form
                  onSubmit={discountForm.handleSubmit(onDiscountSubmit)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* Discount Type */}
                    <FormField
                      control={discountForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Discount Type</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="border border-gray-300">
                                <SelectValue placeholder="Select discount type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Bulk Discount">Bulk Discount</SelectItem>
                              <SelectItem value="Quantity Range Discount">
                                Quantity Range Discount
                              </SelectItem>
                              <SelectItem value="Minimum Total Discount">Minimum Total Discount</SelectItem>
                              <SelectItem value="Code Discount">Code Discount</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Discount Unit */}
                    {discountType !== 'Quantity Range Discount' && (
                    <FormField
                      control={discountForm.control}
                      name="discountUnit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Discount Unit</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="border border-gray-300">
                                <SelectValue placeholder="Select discount unit" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="percentage">Percentage (%)</SelectItem>
                              <SelectItem value="amount">Amount ($)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    )}

                    {/* Discount Amount */}
                    {discountType !== 'Quantity Range Discount' && (
                    <FormField
                      control={discountForm.control}
                      name="discountAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Discount</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={discountUnit === 'percentage' ? '100' : undefined}
                              placeholder={discountUnit === 'percentage' ? 'eg: 10' : 'eg: 5.00'}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    )}

                    {/* Min Quantity - Only shown for Bulk Discount */}
                    {discountType === 'Bulk Discount' && (
                      <FormField
                        control={discountForm.control}
                        name="minQuantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Minimum Quantity</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="1"
                                min="1"
                                placeholder="eg: 5"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => {
                                  const value = e.target.value
                                  field.onChange(value === '' ? null : Number(value))
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {discountType === 'Quantity Range Discount' && (
                      <>
                        <FormField
                          control={discountForm.control}
                          name="minQuantity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fewest tickets for a discount</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="1"
                                  min="2"
                                  placeholder="eg: 2"
                                  {...field}
                                  value={field.value ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value
                                    field.onChange(value === '' ? null : Number(value))
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={discountForm.control}
                          name="minDiscountPercent"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Discount at that quantity (%)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  placeholder="eg: 5"
                                  {...field}
                                  value={field.value ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value
                                    field.onChange(value === '' ? null : Number(value))
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={discountForm.control}
                          name="maxQuantity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Most tickets in the range</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="1"
                                  min="3"
                                  placeholder="eg: 10"
                                  {...field}
                                  value={field.value ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value
                                    field.onChange(value === '' ? null : Number(value))
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={discountForm.control}
                          name="maxDiscountPercent"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Discount at that quantity (%)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  placeholder="eg: 20"
                                  {...field}
                                  value={field.value ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value
                                    field.onChange(value === '' ? null : Number(value))
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {/* Min Total - Only shown for Minimum Total Discount */}
                    {discountType === 'Minimum Total Discount' && (
                      <FormField
                        control={discountForm.control}
                        name="minTotal"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Minimum Total</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="eg: 100.00"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => {
                                  const value = e.target.value
                                  field.onChange(value === '' ? null : Number(value))
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Code - Only shown for Code Discount */}
                    {discountType === 'Code Discount' && (
                      <FormField
                        control={discountForm.control}
                        name="code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Discount Code</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                placeholder="eg: SAVE20"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => {
                                  field.onChange(e.target.value === '' ? null : e.target.value)
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Max tickets - Only shown for Code Discount. Empty means unlimited. */}
                    {discountType === 'Code Discount' && (
                      <FormField
                        control={discountForm.control}
                        name="maxUses"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Maximum Tickets</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="1"
                                min="1"
                                placeholder="eg: 50"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => {
                                  const value = e.target.value
                                  field.onChange(value === '' ? null : Number(value))
                                }}
                              />
                            </FormControl>
                            <FormDescription>
                              Leave empty for unlimited tickets. Each discounted ticket counts toward this limit. Extra tickets in the same order pay the regular price.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  {discountType === 'Quantity Range Discount' && (
                    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                      <p>
                        The discount rises evenly from the smaller group to the
                        larger one. One ticket stays full price. Past the
                        largest group, the highest discount stays. It applies
                        separately to each ticket type.
                      </p>
                      {rangePreview.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {(rangePreview.length > 16
                            ? [
                                ...rangePreview.slice(0, 8),
                                null,
                                ...rangePreview.slice(-4),
                              ]
                            : rangePreview
                          ).map((step, index) =>
                            step ? (
                              <span
                                key={step.quantity}
                                className="rounded bg-white px-2 py-1 text-xs text-slate-700"
                              >
                                {step.quantity} tickets:{' '}
                                {formatDiscountPercent(step.percent)}%
                              </span>
                            ) : (
                              <span
                                key={`gap-${index}`}
                                className="px-1 py-1 text-xs text-slate-400"
                              >
                                …
                              </span>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cannot Be Stacked Checkbox */}
                  {discountType !== 'Quantity Range Discount' && (
                  <FormField
                    control={discountForm.control}
                    name="cannotBeStacked"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2 rounded-md border border-slate-200 px-3 py-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          Discount cannot be stacked with others
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  )}

                  <div className="flex gap-x-2">
                    <Button
                      type="submit"
                      disabled={isDiscountSubmitting || !isDiscountValid || isLoading}
                    >
                      {editingDiscountId ? 'Update Discount' : 'Create Discount'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetDiscountForm}
                      disabled={isDiscountSubmitting || isLoading}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}
        </>
      </div>
    </>
  )
}

export default EventDiscounts


