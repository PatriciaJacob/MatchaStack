import { renderToString } from 'react-dom/server';
import App from './app.js';
import { matchRoute, RouteProps } from './router.js';
import { routes } from './routes.js';

// Re-export routes so plugin can access them
export { routes };

export async function loadProps(url: string): Promise<RouteProps> {
  const route = matchRoute(routes, url);
  let props: RouteProps = {};

  if (route?.getStaticProps) {
    const result = await route.getStaticProps();
    // Support { props: { ... } } format (Next.js style)
    props = { ...props, ...('props' in result ? (result as { props: RouteProps }).props : result) };
  }

  if (route?.getServerSideProps) {
    const result = await route.getServerSideProps();
    // Support { props: { ... } } format (Next.js style)
    props = { ...props, ...('props' in result ? (result as { props: RouteProps }).props : result) };
  }

  return props;
}

export async function render(url: string) {
  const props = await loadProps(url);

  const html = renderToString(<App path={url} props={props} />);
  return { html, props };
}
