import { VerifyEmail } from "@/components/auth/verify-email";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <VerifyEmail token={typeof token === "string" ? token : undefined} />
      </div>
    </div>
  );
}
