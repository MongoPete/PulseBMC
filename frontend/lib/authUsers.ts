/** Server-side login accounts from environment (never exposed to the browser). */
export function getAuthUsers(): { id: string; email: string; password: string }[] {
  const users: { id: string; email: string; password: string }[] = [];

  const demoEmail = process.env.DEMO_USER?.trim();
  const demoPassword = process.env.DEMO_USER_PASSWORD;
  if (demoEmail && demoPassword) {
    users.push({ id: "demo", email: demoEmail, password: demoPassword });
  }

  const customerEmail = process.env.CUSTOMER_USER?.trim();
  const customerPassword = process.env.CUSTOMER_USER_PASSWORD;
  if (customerEmail && customerPassword) {
    users.push({ id: "customer", email: customerEmail, password: customerPassword });
  }

  return users;
}

export function matchAuthUser(
  email: string | undefined,
  password: string | undefined,
): { id: string; email: string } | null {
  if (!email || !password) return null;
  const normalized = email.trim().toLowerCase();
  const user = getAuthUsers().find(
    (u) => u.email.toLowerCase() === normalized && u.password === password,
  );
  if (!user) return null;
  return { id: user.id, email: user.email };
}
