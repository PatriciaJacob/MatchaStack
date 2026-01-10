import React from 'react';
import fs from 'node:fs';

// Static content - will break client bundle later (getStaticProps motivation)
const myBlog = fs.readFileSync('static/blog.md', 'utf8');

// Interactive component - renders but won't work without hydration
function Counter() {
  const [count, setCount] = React.useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}

function App() {
  return (
    <div>
      <h1>MatchaStack</h1>
      <Counter />
      <hr />
      <p>{myBlog}</p>
    </div>
  );
}

export default App;
