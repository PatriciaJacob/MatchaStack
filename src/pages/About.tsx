import { Link } from '../router.js';

export default function About() {
  return (
    <div>
      <h1>About</h1>
      <p>A minimal SSG framework.</p>
      <nav>
        <Link to="/">Go Home</Link>
      </nav>
    </div>
  );
}
