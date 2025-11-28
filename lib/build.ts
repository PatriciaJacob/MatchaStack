// TODO: try renderToString vs prerenderToNodeStream

import { renderToString } from 'react-dom/server';
import React from 'react';
import App from '../app/app';
import fs from 'node:fs';

const html = fs.readFileSync('app/index.html', 'utf8');
const myApp = renderToString(React.createElement(App));

const htmlWithApp = html.replace('{{app-holder}}', myApp);

console.log(htmlWithApp);
fs.writeFileSync('dist/index.html', htmlWithApp);
