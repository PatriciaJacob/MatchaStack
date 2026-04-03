import type { Route } from './router.js';
import Home from './pages/Home.js';
import * as AboutPage from './pages/About.js';
import * as ServerPage from './pages/Server.js';

export const routes: Route[] = [
  { path: '/', component: Home },
  { path: '/about', component: AboutPage.default, getStaticProps: AboutPage.getStaticProps },
  { path: '/server', component: ServerPage.default, getServerSideProps: ServerPage.getServerSideProps },
];
