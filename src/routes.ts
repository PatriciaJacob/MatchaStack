import type { Route } from './router.js';
import Home from './pages/Home.js';
import About, { getStaticProps as AboutGetStaticProps } from './pages/About.js';
import UserProfile, { getStaticProps as UserProfileGetStaticProps, getServerSideProps as UserProfileGetServerSideProps } from './pages/UserProfile.js';

export const routes: Route[] = [
  { path: '/', component: Home },
  { path: '/about', component: About, getStaticProps: AboutGetStaticProps },
  { path: '/user-profile', component: UserProfile, getStaticProps: UserProfileGetStaticProps, getServerSideProps: UserProfileGetServerSideProps },
];
