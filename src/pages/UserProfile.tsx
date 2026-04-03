import { Link, type RouteProps } from '../router.js';

interface User {
  id: string;
  name: string;
  email: string;
  plan: 'free' | 'pro';
  lastLoginAt: string;
}

interface UserProfileProps extends RouteProps {
  user: User;
  generatedAt: string;
  builtAt: string;
}

export async function getStaticProps() {
  return {
    builtAt: new Date().toISOString(),
  };
}

export async function getServerSideProps() {
  const user: User = {
    id: 'user_123',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    plan: 'pro',
    lastLoginAt: '2026-02-08T16:30:00.000Z',
  };

  return {
    user,
    generatedAt: new Date().toISOString(),
  };
}

export default function UserProfile({ user, generatedAt, builtAt }: UserProfileProps) {
  console.log('UserProfile', {user, generatedAt, builtAt});
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
        <dd>{new Date(user.lastLoginAt).toLocaleString()}</dd>
      </dl>

      <p>Generated at: {new Date(generatedAt).toLocaleString()}</p>

      <p>Built at: {new Date(builtAt).toLocaleString()}</p>

      <nav>
        <Link to="/">Go Home</Link>
      </nav>
    </div>
  );
}
