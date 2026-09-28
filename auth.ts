import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import type { Adapter } from 'next-auth/adapters'
import { prisma } from './lib/db'
import authConfig from './auth.config'

const adapter = {
  ...PrismaAdapter(prisma),
  async createUser({ email, name, image, emailVerified }) {
    const createdUser = await prisma.user.create({
      data: {
        email,
        name,
        image,
        role: ['USER'],
        // Auth.js calls this field `emailVerified`, while the application schema
        // stores the same value as `emailVerifiedDate`.
        emailVerifiedDate: emailVerified,
      },
    })

    return {
      ...createdUser,
      emailVerified: createdUser.emailVerifiedDate,
    }
  },
} satisfies Adapter

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  pages: {
    signIn: '/app/signIn',
  },
  adapter,
  session: { strategy: 'jwt' },
  ...authConfig,
})
