# Contributing to Conatus

Contributions should keep `main` releasable. Use a short-lived branch, open a
pull request and merge only after every required check passes.

## Development setup

```bash
cp .env.example .env
npm ci
npm run dev
```

Point `DATABASE_URL` at a development PostgreSQL instance. Attachments require
MinIO. Email is optional.

## Required checks

Run the application checks:

```bash
npm ci
npm test
npm run lint
npm run build
npm run test:e2e
```

Run the MCP server checks:

```bash
npm --prefix mcp-server ci
npm --prefix mcp-server test
npm --prefix mcp-server run lint
npm --prefix mcp-server run build
```

Validate the container deployment:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml config
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d
docker compose ps
curl --fail http://localhost:3000/api/health
docker compose down
```

## Release policy

Conatus uses Semantic Versioning. A beta fix increments the beta suffix. A
stable bug fix increments the patch version. A backward-compatible feature
increments the minor version. Every breaking change must be called out in the
GitHub Release notes.

Never move or reuse a published tag. Back up a production database before an
upgrade because a database rollback can require restoring that backup.

## Prepare a release

The example below uses `0.2.0-beta.1`. Replace it with the intended version.

1. Create a release branch from `main`.

   ```bash
   git switch main
   git pull --ff-only
   git switch -c release/v0.2.0-beta.1
   ```

2. Update the application version plus the MCP and operations package versions.

   ```bash
   npm version 0.2.0-beta.1 --no-git-tag-version
   npm --prefix mcp-server version 0.2.0-beta.1 --no-git-tag-version
   npm --prefix ops version 0.2.0-beta.1 --no-git-tag-version
   ```

   `npm version` requires a clean working tree. If release preparation has
   uncommitted changes, update the versions with `npm pkg set` instead:

   ```bash
   npm pkg set version=0.2.0-beta.1
   npm --prefix mcp-server pkg set version=0.2.0-beta.1
   npm --prefix ops pkg set version=0.2.0-beta.1
   npm install --package-lock-only --ignore-scripts
   npm --prefix mcp-server install --package-lock-only --ignore-scripts
   npm --prefix ops install --package-lock-only --ignore-scripts
   ```

3. Prepare GitHub Release notes with these sections:

   - Highlights
   - Image-only installation commands
   - Upgrade and migration notes
   - Known limitations
   - A summary of fixes

4. Run every check from the Required checks section.

5. Check the proposed change before committing it.

   ```bash
   git diff --check
   git status --short
   git diff
   ```

6. Commit the release preparation and push the branch.

   ```bash
   git add --all
   git diff --cached
   git commit -m "Prepare v0.2.0-beta.1 release"
   git push -u origin release/v0.2.0-beta.1
   ```

7. Open a pull request. Wait for every check, review the complete diff and merge
   it into `main`.

## Publish a release

1. Update local `main` and confirm that the working tree is clean.

   ```bash
   git switch main
   git pull --ff-only
   git status --short
   ```

2. Create an annotated tag from the verified commit and push it.

   ```bash
   git tag -a v0.2.0-beta.1 -m "Conatus 0.2.0-beta.1"
   git show v0.2.0-beta.1 --no-patch
   git push origin v0.2.0-beta.1
   ```

3. Publish the GitHub prerelease. Put the prepared notes in a temporary file
   outside the repository, such as `/tmp/conatus-release-notes.txt`.

   ```bash
   gh release create v0.2.0-beta.1 \
     --verify-tag \
     --prerelease \
     --latest=false \
     --title "Conatus 0.2.0-beta.1" \
     --notes-file /tmp/conatus-release-notes.txt
   ```

4. Open GitHub Actions and wait for every Publish release images job. The
   workflow builds `linux/amd64` plus `linux/arm64` images. It publishes the
   application, operations and MCP artifacts. It also attaches
   `docker-compose.yml` plus `.env.example` to the GitHub Release.

5. Verify the published images.

   ```bash
   docker pull ghcr.io/nojusmorkunas/conatus:0.2.0-beta.1
   docker pull ghcr.io/nojusmorkunas/conatus:0.2.0-beta.1-ops
   docker pull ghcr.io/nojusmorkunas/conatus-mcp:0.2.0-beta.1
   ```

6. Open the settings for the `conatus` and `conatus-mcp` packages. Change their
   visibility to public only when anonymous installation is intended. GitHub
   does not allow a public package to become private again.

7. Test the release by following the image-only installation instructions in
   the root README from an empty directory.

## Promote a stable release

After beta validation, prepare `0.2.0` through the same process. Publish it as a
normal release rather than a prerelease. The release workflow will then update
the `latest` and `latest-ops` tags.

Use `0.2.1` only for a bug fix released after `0.2.0`. Do not use `0.2.1` merely
because the Docker workflow was added before the first `0.2.0` release.
