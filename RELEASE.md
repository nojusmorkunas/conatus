# Maintainer release plan

No publishing step is automated from this repository. The maintainer performs
all pushes, tags, package publication, image publication, and hosted releases.

## Candidate: 0.2.0-beta.1

### 1. Freeze and verify

1. Create a release branch from the intended commit.
2. Confirm `TODO.md` and the 0.2.0 section of `CHANGELOG.md` match the diff.
3. Install from the lockfiles with `npm ci` and `npm ci --prefix mcp-server`.
4. Run `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e`.
5. Run `npm test --prefix mcp-server`, `npm run lint --prefix mcp-server`, and `npm run build --prefix mcp-server`.
6. Start from an empty database, apply every migration, and run the core browser flow.
7. Restore a recent database backup into a disposable database, apply new migrations, and check counts plus representative tasks.
8. Exercise Todoist API and ZIP imports using non-production Todoist fixtures.
9. Build the Docker Compose stack and verify health, login, a scheduled reminder, object upload, backup, and restore.

### 2. Security and operations check

1. Confirm production secrets are not present in tracked files or build output.
2. Rotate any credential used in release testing.
3. Verify API tokens respect scope, expiry, revocation, and idempotency behavior.
4. Verify MCP HTTP OAuth discovery, PKCE, refresh rotation, and static-token fallback in the target topology.
5. Confirm SMTP, storage, job worker, proxy headers, public base URL, and health checks are configured.

### 3. Publish (maintainer only)

1. Update versions and lockfiles to `0.2.0-beta.1`; commit the release artifacts.
2. Tag the verified commit `v0.2.0-beta.1` and push the branch and tag.
3. Build immutable application and MCP images from that exact tag; record digests.
4. If publishing the MCP npm package, verify the package scope, run `npm pack --dry-run`, then publish with the beta dist-tag.
5. Create a prerelease using the matching `CHANGELOG.md` section, migration notes, image digests, and rollback instructions.
6. Deploy to the beta environment, rerun health and core-flow smoke checks, then invite the beta cohort.

### 4. Observe and roll back

Monitor error rate, failed jobs, webhook failures, import errors, latency, and
database/storage growth. If data integrity or authentication regresses, stop the
rollout, preserve logs, restore the pre-release database backup if required, and
redeploy the prior immutable image. Do not reverse a migration against the only
copy of user data.
