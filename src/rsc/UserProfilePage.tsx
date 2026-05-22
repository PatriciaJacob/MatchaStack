interface User {
  id: string;
  name: string;
  email: string;
  plan: 'free' | 'pro';
  lastLoginAt: string;
}

function loadUser(): User {
  return {
    id: 'user_123',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    plan: 'pro',
    lastLoginAt: '2026-02-08T16:30:00.000Z',
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export default function UserProfilePage() {
  const user = loadUser();
  const generatedAt = new Date().toISOString();

  return (
    <div>
      <h1>User Profile (Sample)</h1>
      <p>This is a good SSR target because profile data is user-specific and changes often.</p>

      <dl>
        <dt>ID</dt>
        <dd>{user.id}</dd>
        <dt>Name</dt>
        <dd>{user.name}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Plan</dt>
        <dd>{user.plan}</dd>
        <dt>Last Login</dt>
        <dd>{formatDate(user.lastLoginAt)}</dd>
      </dl>

      <p>Generated at: {formatDate(generatedAt)}</p>

      <nav>
        <a href="/">Go Home</a>
      </nav>
    </div>
  );
}
