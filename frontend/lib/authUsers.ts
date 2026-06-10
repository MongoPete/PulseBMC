/** Server-side demo login from DEMO_USER / DEMO_USER_PASSWORD (never exposed to the browser). */
export function matchAuthUser(
  email: string | undefined,
  password: string | undefined,
): { id: string; email: string } | null {
  const demoEmail = process.env.DEMO_USER?.trim();
  const demoPassword = process.env.DEMO_USER_PASSWORD;
  if (!demoEmail || !demoPassword || !email || !password) return null;

  if (
    email.trim().toLowerCase() === demoEmail.toLowerCase() &&
    password === demoPassword
  ) {
    return { id: "demo", email: demoEmail };
  }
  return null;
}
