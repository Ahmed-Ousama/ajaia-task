-- Authentication moved to Keycloak (OIDC); local password hashes are no longer stored.
ALTER TABLE "User" DROP COLUMN "passwordHash";
