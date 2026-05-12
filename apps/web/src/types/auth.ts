export interface SessionResponse {
  session: Session
  user: User
}

export interface Session {
  id: string
  expiresAt: Date
  token: string
  createdAt: string
  updatedAt: Date
  ipAddress: string
  userAgent: string
  userId: string
  impersonatedBy: string | null
}

export interface User {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: string
  updatedAt: string
  role: string | null
  banned: boolean
  banReason: string | null
  banExpires: Date | null
}
