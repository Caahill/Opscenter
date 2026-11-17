// Checks the staging password and sets the gate cookie (30 days). Wrong passwords wait a second,
// which keeps guessing slow; the generated password is long enough that guessing is hopeless anyway.
import { GATE_COOKIE, gateToken, isStaging, passwordMatches, safeNext } from '@/lib/staging-gate';

const seeOther = (location: string, cookie?: string) =>
  new Response(null, { status: 303, headers: { Location: location, ...(cookie ? { 'Set-Cookie': cookie } : {}) } });

export async function POST(req: Request) {
  if (!isStaging()) return new Response(null, { status: 404 });
  const form = await req.formData().catch(() => null);
  const given = form?.get('password');
  const next = safeNext(typeof form?.get('next') === 'string' ? (form.get('next') as string) : '/');
  if (typeof given !== 'string' || !passwordMatches(given)) {
    await new Promise((r) => setTimeout(r, 1000));
    return seeOther(`/gate?error=1&next=${encodeURIComponent(next)}`);
  }
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return seeOther(next, `${GATE_COOKIE}=${gateToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
}
