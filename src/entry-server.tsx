import { renderToString } from 'react-dom/server';
import App from './app.js';
import { matchRoute, RouteProps } from './router.js';
import { routes } from './routes.js';

// Re-export routes so plugin can access them
export { routes };

function normalizeLoaderResult(result: unknown): RouteProps {
  if (!result || typeof result !== 'object') return {};
  return 'props' in (result as { props?: RouteProps })
    ? ((result as { props?: RouteProps }).props ?? {})
    : (result as RouteProps);
}

export async function loadStaticProps(url: string): Promise<RouteProps> {
  const route = matchRoute(routes, url);
  let props: RouteProps = {};

  if (route?.getStaticProps) {
    const result = await route.getStaticProps();
    props = { ...props, ...normalizeLoaderResult(result) };
  }

  return props;
}

export async function loadServerSideProps(url: string): Promise<RouteProps> {
  const route = matchRoute(routes, url);
  let props: RouteProps = {};

  if (route?.getServerSideProps) {
    const result = await route.getServerSideProps();
    props = { ...props, ...normalizeLoaderResult(result) };
  }

  return props;
}

export async function render(url: string) {
  const staticProps = await loadStaticProps(url);
  const serverProps = await loadServerSideProps(url);
  const props = { ...staticProps, ...serverProps };
  return renderWithProps(url, props);
}

export function renderWithProps(url: string, props: RouteProps) {
  const html = renderToString(<App path={url} props={props} />);
  return { html, props };
}
