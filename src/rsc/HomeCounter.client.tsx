'use client';

import * as React from 'react';

export default function HomeCounter() {
  const [count, setCount] = React.useState(0);

  return (
    <button onClick={() => setCount((value) => value + 1)}>
      Clicked {count} times
    </button>
  );
}
