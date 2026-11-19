-- DropIndex
DROP INDEX "GithubInstallation_installationId_key";

-- CreateIndex
CREATE UNIQUE INDEX "GithubInstallation_installationId_organizationId_key" ON "GithubInstallation"("installationId", "organizationId");
