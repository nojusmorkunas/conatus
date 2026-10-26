import { invalid, unauthorized } from "@/lib/api/responses";
import { createDeviceLoginCode } from "@/lib/auth/device-login";
import { requireSessionUser } from "@/lib/auth/session";
import { nativeAppRedirect } from "@/lib/native-app";
import { deviceLoginRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user) return unauthorized();

  const formData = await request.formData().catch(() => null);
  const parsed = deviceLoginRequestSchema.safeParse({
    device: formData?.get("device"),
    challenge: formData?.get("challenge"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const raw = await createDeviceLoginCode({
    userId: user.id,
    codeChallenge: parsed.data.challenge,
    deviceName: parsed.data.device,
  });
  return new Response(null, {
    status: 303,
    headers: { Location: `${nativeAppRedirect}?code=${raw}` },
  });
}
