/** Server-side login accounts from env (never exposed to the browser). */
export function getAuthUsers(): { id: string; email: string; password: string }[] {
  const users: { id: string; email: string; password: string }[] = [];

  const pairs: { id: string; email?: string; password?: string }[] = [
    { id: "demo", email: process.env.DEMO_USER?.trim(), password: process.env.DEMO_USER_PASSWORD },
    { id: "demo2", email: process.env.DEMO_USER_2?.trim(), password: process.env.DEMO_USER_PASSWORD_2 },
  ];

  for (const { id, email, password } of pairs) {
    if (email && password) {
      users.push({ id, email, password });
    }
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
