'use client'

// Libraries
import * as React from 'react'
import { usePathname } from 'next/navigation'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

// Components
import Link from 'next/link'
import { ArrowBigLeft } from 'lucide-react'

// Interfaces & Types
const backButtonVariants = cva(
  'flex-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // default location is the top left corner of the screen
        default:
          'absolute left-1 md:left-3 top-[170px] bg-bgColor-brand900 text-textColor-white p-3 text-sm font-semibold hover:bg-bgColor-brand600 shadow',
        responsive:
          'mt-6 ml-3 top-[170px] bg-bgColor-brand900 text-textColor-white p-3 text-sm font-semibold hover:bg-bgColor-brand600 shadow',
      },
      size: {
        default: 'md:h-9 px-3 md:px-4 py-2 h-8 md:text-sm text-xs',
        sm: 'md:h-8 h-7 rounded-md px-3 text-xs',
        lg: 'md:h-10 h-9 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface BackButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof backButtonVariants> {
  asChild?: boolean
}

const eventType = ['concert', 'class', 'camping', 'event']

// Main Component
const BackButton = React.forwardRef<HTMLButtonElement, BackButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const currentPath = usePathname() || '/'
    let parentPath = currentPath.split('/').slice(0, -1).join('/') || '/'

    if (parentPath.split('/').at(-1) === 'editPost') {
      // For Edit Post Page, the flow is from allPosts to editPost
      parentPath = parentPath.replace('editPost', 'allPosts')
    } else if (parentPath.split('/').at(-1) === 'editEvent') {
      // For Edit Post Page, the flow is from allPosts to editPost
      parentPath = parentPath.replace('editEvent', 'allEvents')
    } else if (eventType.some((type) => parentPath.includes(type))) {
      // For Event Pages, these pages are bridge pages so we will skip them
      const matchedType = eventType.find((type) => parentPath.includes(type))

      if (matchedType === 'event') {
        if (currentPath?.includes('/event/')) {
          // match exactly /event
          parentPath = parentPath.replace(/\/event(?:\/|$)/, '')
        }
      } else {
        parentPath = parentPath.replace(`/${matchedType}`, '')
      }
    } else if (parentPath.includes('job')) {
      // For Event Class Page, class page is is just a bridge page so we will skip it
      parentPath = parentPath.replace('editJob', 'allJobs')
    }
    const Comp = asChild ? Slot : 'button'

    return (
      <Link href={parentPath as string}>
        <Comp
          className={cn(backButtonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          <ArrowBigLeft className="h-5 w-5" />
          Previous
        </Comp>
      </Link>
    )
  }
)
BackButton.displayName = 'BackButton'

export default BackButton
