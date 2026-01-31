import fs from 'node:fs';
import { Link, RouteProps } from '../router.js';

export const getStaticProps = () => {
  return {
    blog: fs.readFileSync('static/blog.md', 'utf8'),
  };
};

interface AboutProps extends RouteProps {
  blog: string;
}

export default function About(props: AboutProps) {
  return (
    <div>
      <h1>About</h1>
      <p>A minimal SSG framework.</p>
      <div>
        Blog:
        <pre>{props.blog}</pre>
      </div>
      <nav>
        <Link to="/">Go Home</Link>
      </nav>
    </div>
  );
}
