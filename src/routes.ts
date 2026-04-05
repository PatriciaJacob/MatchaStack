import type { Route } from './router.js';
import Home from './pages/Home.js';
import * as AboutPage from './pages/About.js';
import * as UserProfilePage from './pages/UserProfile.js';

export const routes: Route[] = [
  { path: '/', component: Home },
  { path: '/about', component: AboutPage.default, getStaticProps: AboutPage.getStaticProps },
  {
    path: '/user-profile',
    component: UserProfilePage.default,
    getStaticProps: UserProfilePage.getStaticProps,
    getServerSideProps: UserProfilePage.getServerSideProps,
  },
];
