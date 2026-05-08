import HomeCounter from './HomeCounter.client-reference.js';

export default function HomePage() {
  return (
    <div>
      <h1>MatchaStack</h1>
      <p>Home now renders through an RSC payload on full document requests.</p>
      <p>The counter below is a client component resolved from the RSC client manifest.</p>
      <HomeCounter />
      <nav>
        <a href="/about">Go to About</a>
        {' | '}
        <a href="/user-profile">View User Sample</a>
      </nav>
    </div>
  );
}
