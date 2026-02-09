import * as React from 'react';
import { Link } from '../router.js';

function Counter() {
  const [count, setCount] = React.useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}

export default function Home() {
  const [content, setContent] = React.useState('initial');

  return (
    <div>
      <h1>MatchaStack</h1>
      <input
        type="text"
        value={content}
        placeholder="Type before hydration..."
        onChange={(e) => setContent(e.target.value)}
        className="bg-blue-500 text-white px-4 py-2 rounded-md"
      />
      <p>{content}</p>
      <Counter />
      <nav>
        <Link to="/about">Go to About</Link>
        {' | '}
        <Link to="/user-profile">View User Sample</Link>
      </nav>
    </div>
  );
}
