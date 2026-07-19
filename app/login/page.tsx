import { connection } from "next/server";

import { LoginForm } from "@/components/auth/login-form";
import { getRegistrationState } from "@/lib/auth/registration";

export default async function LoginPage() {
  await connection();
  const registrationState = await getRegistrationState();

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <LoginForm
          bootstrapAvailable={registrationState.kind === "bootstrap"}
        />
      </div>
    </div>
  );
}
