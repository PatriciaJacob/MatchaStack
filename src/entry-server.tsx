import { renderToString } from 'react-dom/server';
import App from './app.js';
import { matchRoute, QueryParams, Route, RouteProps, RoutePropsResult, ServerSidePropsContext } from './router.js';
import { routes } from './routes.js';

// Re-export routes so plugin can access them
export { routes };

interface RouteDataResult {
  route: Route | undefined;
  context: ServerSidePropsContext;
  props: RouteProps;
}

function normalizeProps(result: RoutePropsResult): RouteProps {
  return 'props' in result ? result.props : result;
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

export async function getRouteData(target: string): Promise<RouteDataResult> {
  const context = createServerSidePropsContext(target);
  const route = matchRoute(routes, context.path);
  let props: RouteProps = {};

  if (route?.getServerSideProps) {
    props = normalizeProps(await route.getServerSideProps(context));
  } else if (route?.getStaticProps) {
    props = normalizeProps(await route.getStaticProps());
  }

  return { route, context, props };
}

export async function render(target: string) {
  const { context, props } = await getRouteData(target);
  const html = renderToString(<App path={context.path} props={props} />);
  return { html, props };
}
