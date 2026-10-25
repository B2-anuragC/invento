ALTER TABLE "users"
  ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "lastActivityAt" TIMESTAMP(3);
CREATE INDEX "users_lastActivityAt_idx" ON "users"("lastActivityAt");
CREATE INDEX "users_lastLoginAt_idx" ON "users"("lastLoginAt");
CREATE TABLE "platform_audit_logs" (
  "id" TEXT NOT NULL PRIMARY KEY, "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL, "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL,
  "businessId" TEXT, "reason" TEXT NOT NULL,
  "previous" JSONB NOT NULL, "next" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "platform_audit_logs_createdAt_id_idx" ON "platform_audit_logs"("createdAt", "id");
CREATE INDEX "platform_audit_logs_targetType_targetId_createdAt_idx" ON "platform_audit_logs"("targetType", "targetId", "createdAt");
CREATE INDEX "platform_audit_logs_businessId_createdAt_idx" ON "platform_audit_logs"("businessId", "createdAt");
CREATE INDEX "platform_audit_logs_actorId_createdAt_idx" ON "platform_audit_logs"("actorId", "createdAt");
