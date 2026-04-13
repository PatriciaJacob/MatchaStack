import { renderToString } from 'react-dom/server';
import App from './app.js';
import { matchRoute, QueryParams, RouteProps, RoutePropsResult, ServerSidePropsContext } from './router.js';
import { routes } from './routes.js';

// Re-export routes so plugin can access them
export { routes };

function normalizeLoaderResult(result: unknown): RouteProps {
  if (!result || typeof result !== 'object') return {};
  return 'props' in (result as { props?: RouteProps })
    ? ((result as { props?: RouteProps }).props ?? {})
    : (result as RoutePropsResult);
}

function toQueryParams(url: URL): QueryParams {
  const query: QueryParams = {};

  for (const [key, value] of url.searchParams.entries()) {
    const current = query[key];
    if (current === undefined) {
      query[key] = value;
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      query[key] = [current, value];
    }
  }

  return query;
}

function createServerSidePropsContext(target: string): ServerSidePropsContext {
  const url = new URL(target, 'http://localhost');
  const path = url.pathname === '/' ? url.pathname : url.pathname.replace(/\/$/, '');

  return {
    url: `${path}${url.search}`,
    path,
    query: toQueryParams(url),
  };
}

export async function loadStaticProps(target: string): Promise<RouteProps> {
  const context = createServerSidePropsContext(target);
  const route = matchRoute(routes, context.path);

  if (!route?.getStaticProps) {
    return {};
  }

  return normalizeLoaderResult(await route.getStaticProps());
}

export async function loadServerSideProps(target: string): Promise<RouteProps> {
  const context = createServerSidePropsContext(target);
  const route = matchRoute(routes, context.path);

  if (!route?.getServerSideProps) {
    return {};
  }

  return normalizeLoaderResult(await route.getServerSideProps(context));
}

export async function render(target: string) {
  const staticProps = await loadStaticProps(target);
  const serverProps = await loadServerSideProps(target);
  const props = { ...staticProps, ...serverProps };
  return renderWithProps(target, props);
}

export function renderWithProps(target: string, props: RouteProps) {
  const context = createServerSidePropsContext(target);
  const html = renderToString(<App path={context.path} props={props} />);
  return { html, props };
}
