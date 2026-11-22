-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_ADDED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "excerpt" TEXT,
ALTER COLUMN "role" DROP NOT NULL;

