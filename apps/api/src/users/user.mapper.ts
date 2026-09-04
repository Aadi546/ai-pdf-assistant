import { User } from "@prisma/client";

/**
 * The full User row includes passwordHash — this is the one place that
 * strips it before a user object is allowed to leave the service layer
 * (spec §54: never log/return sensitive fields).
 */
export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}
