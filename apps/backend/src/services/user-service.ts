import { prisma } from '~/lib/prisma';

type AuthClaims = {
  oid: string;
  email: string;
  displayName: string;
};

export async function getOrCreateUserFromClaims(claims: AuthClaims) {
  return prisma.user.upsert({
    where: { entraOid: claims.oid },
    create: {
      entraOid: claims.oid,
      email: claims.email,
      displayName: claims.displayName,
      lastLoginAt: new Date(),
    },
    update: {
      email: claims.email,
      displayName: claims.displayName,
      lastLoginAt: new Date(),
    },
  });
}
