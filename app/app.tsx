import React from 'react';

import fs from 'node:fs';

const myBlog = fs.readFileSync('static/blog.md', 'utf8');

function App() {
  const [count, setCount] = React.useState(0);

  return <div>Hello World! and {myBlog}</div>;
}

export default App;
