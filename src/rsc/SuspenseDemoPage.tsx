import { Suspense } from 'react';

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function SlowServerPanel() {
  const startedAt = new Date().toISOString();
  await wait(2000);
  const resolvedAt = new Date().toISOString();

  return (
    <section>
      <h2>Slow Server Panel</h2>
      <p>This server component waited for 2 seconds before resolving.</p>
      <dl>
        <dt>Started</dt>
        <dd>{startedAt}</dd>
        <dt>Resolved</dt>
        <dd>{resolvedAt}</dd>
      </dl>
    </section>
  );
}

export default function SuspenseDemoPage() {
  return (
    <div>
      <h1>Suspense Demo</h1>
      <p>
        This route has an async server component inside a Suspense boundary. Navigation
        streams the Flight response, so the page can appear before the slow panel resolves.
      </p>

      <Suspense fallback={<p data-testid="slow-panel-fallback">Loading slow server panel...</p>}>
        <SlowServerPanel />
      </Suspense>

      <nav>
        <a href="/">Go Home</a>
        {' | '}
        <a href="/about">Go to About</a>
      </nav>
    </div>
  );
}
