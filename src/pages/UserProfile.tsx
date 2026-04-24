import * as React from 'react';
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

const timestampFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'UTC',
});

function formatServerTimestamp(value: string) {
  return `${timestampFormatter.format(new Date(value))} UTC`;
}

function formatClientTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function LocalizedTimestamp({ value }: { value: string }) {
  const [displayValue, setDisplayValue] = React.useState(() => formatServerTimestamp(value));
  const [isLocalized, setIsLocalized] = React.useState(false);

  React.useEffect(() => {
    setDisplayValue(formatClientTimestamp(value));
    setIsLocalized(true);
  }, [value]);

  return (
    <time
      dateTime={value}
      style={{
        visibility: isLocalized ? 'visible' : 'hidden',
      }}
    >
      {displayValue}
    </time>
  );
}

export default function UserProfile({ user, generatedAt, builtAt }: UserProfileProps) {
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
        <dd><LocalizedTimestamp value={user.lastLoginAt} /></dd>
      </dl>

      <p>Generated at: <LocalizedTimestamp value={generatedAt} /></p>

      <p>Built at: <LocalizedTimestamp value={builtAt} /></p>

      <nav>
        <Link to="/">Go Home</Link>
      </nav>
    </div>
  );
}
