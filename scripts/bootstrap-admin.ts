import { bootstrapAdmin, readBootstrapAdminConfig } from "@/lib/auth/bootstrap-admin";
import { closeDatabase } from "@/lib/db";

async function main() {
  const config = readBootstrapAdminConfig();
  if (!config) {
    console.log("Admin bootstrap skipped: no bootstrap credentials configured.");
    return;
  }

  const result = await bootstrapAdmin(config);
  if (result.created) {
    console.log(`Bootstrap administrator created for ${result.user.username}.`);
  } else {
    console.log("Admin bootstrap skipped: the server already has an account.");
  }
}

main()
  .catch((error) => {
    console.error("Admin bootstrap failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
