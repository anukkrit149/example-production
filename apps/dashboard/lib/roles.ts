import type { User, UserRole } from '@hf/db'

/** Who may create and edit commercial data. Everyone else reads. */
export const WRITE_ROLES: UserRole[] = ['merchandiser', 'admin']
export const canWrite = (u: User): boolean => WRITE_ROLES.includes(u.role)
export const isAdmin = (u: User): boolean => u.role === 'admin'
