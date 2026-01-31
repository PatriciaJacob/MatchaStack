import type { Route } from './router.js';
import Home from './pages/Home.js';
import About, { getStaticProps as AboutGetStaticProps } from './pages/About.js';

export const routes: Route[] = [
  { path: '/', component: Home },
  { path: '/about', component: About, getStaticProps: AboutGetStaticProps },
];
