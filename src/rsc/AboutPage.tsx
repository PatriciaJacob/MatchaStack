import { readFileSync } from 'node:fs';

export default function AboutPage() {
  const blog = readFileSync('static/blog.md', 'utf8');

  return (
    <div>
      <h1>About</h1>
      <p>A minimal SSG framework.</p>
      <div>
        Blog:
        <pre>{blog}</pre>
      </div>
      <nav>
        <a href="/">Go Home</a>
        {' | '}
        <a href="/user-profile">Visit User Sample</a>
      </nav>
    </div>
  );
}
