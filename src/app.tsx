import React from 'react';


// Should only run on the server
//   import fs from 'node:fs';
//   const myBlog = fs.readFileSync('static/blog.md', 'utf8').split('\n');

function Counter() {
  const [count, setCount] = React.useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}

function App() {
  const [content, setContent] = React.useState('initial');
  return (
    <div>
      <h1>MatchaStack</h1>
      <input type="text" value={content} placeholder="Type before hydration..."
        onChange={(e) => setContent(e.target.value)} className="bg-blue-500 text-white px-4 py-2 rounded-md" />
      <p>{content}</p>
      <Counter />
    </div>
  );
}

export default App;
