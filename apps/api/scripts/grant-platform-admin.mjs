import { PrismaClient } from '@prisma/client';

const [email, ...reasonParts] = process.argv.slice(2);
const reason = reasonParts.join(' ').trim();
if (!email || reason.length < 5 || reason.length > 500) {
  console.error(
    'Usage: node --env-file=.env scripts/grant-platform-admin.mjs <existing-email> <reason (5–500 chars)>',
  );
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(80241024)`;
    const user = await tx.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, isActive: true, isPlatformAdmin: true },
    });
    if (!user?.isActive)
      throw new Error('An existing active user is required.');
    if (user.isPlatformAdmin)
      throw new Error('User already has platform access.');
    await tx.user.update({
      where: { id: user.id },
      data: { isPlatformAdmin: true },
    });
    await tx.platformAuditLog.create({
      data: {
        actorId: `operator:${process.env.USER || 'cli'}`,
        action: 'GRANT_PLATFORM_ADMIN',
        targetType: 'user',
        targetId: user.id,
        reason,
        previous: { isPlatformAdmin: false },
        next: { isPlatformAdmin: true },
      },
    });
    console.log(`Platform access granted to user ${user.id}.`);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
