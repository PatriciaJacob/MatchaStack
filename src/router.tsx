import * as React from 'react';

// --- Types ---

export type RouteProps = Record<string, unknown>;

export interface Route {
  path: string;
  component: React.ComponentType<RouteProps>;
  getStaticProps?: () => RouteProps | Promise<RouteProps>;
}

export interface RouterContextValue {
  path: string;
  navigate: (to: string) => Promise<void>;
}

// --- Context ---

const RouterContext = React.createContext<RouterContextValue | null>(null);

export function useRouter(): RouterContextValue {
  const ctx = React.useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within Router');
  return ctx;
}

// --- Router ---

interface RouterProps {
  routes: Route[];
  initialPath: string;
  initialProps?: RouteProps;
}

async function fetchRouteProps(path: string): Promise<RouteProps> {
  const propsUrl = path === '/' ? '/_props.json' : `${path}/_props.json`;
  try {
    const res = await fetch(propsUrl);
    if (res.ok) {
      return await res.json() as RouteProps;
    }
  } catch {
    // Props fetch failed, continue without props
  }
  return {};
}

export function Router({ routes, initialPath, initialProps }: RouterProps) {
  const [path, setPath] = React.useState(initialPath);
  const [props, setProps] = React.useState<RouteProps>(initialProps ?? {});
  const [isLoading, setIsLoading] = React.useState(false);

  const navigate = React.useCallback(async (to: string) => {
    const normalized = normalizePath(to);
    
    setIsLoading(true);
    const newProps = await fetchRouteProps(normalized);
    
    window.history.pushState({ props: newProps }, '', to);
    setPath(normalized);
    setProps(newProps);
    setIsLoading(false);
  }, []);

  // Handle browser back/forward
  React.useEffect(() => {
    const onPopState = async (e: PopStateEvent) => {
      const newPath = normalizePath(window.location.pathname);
      setPath(newPath);
      
      // Use cached props from history state, or fetch
      if (e.state?.props) {
        setProps(e.state.props as RouteProps);
      } else {
        setIsLoading(true);
        const newProps = await fetchRouteProps(newPath);
        setProps(newProps);
        setIsLoading(false);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const route = matchRoute(routes, path);
  if (!route) {
    return <div>404 - Not Found</div>;
  }

  const Component = route.component;

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {isLoading ? <div>Loading...</div> : <Component {...props} />}
    </RouterContext.Provider>
  );
}

// --- Link ---

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  children: React.ReactNode;
}

export function Link({ to, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    navigate(to);
  };

  return (
    <a href={to} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}

// --- Utils ---

function normalizePath(path: string): string {
  // Remove trailing slash (except for root)
  return path === '/' ? path : path.replace(/\/$/, '');
}

export function matchRoute(routes: Route[], path: string): Route | undefined {
  const normalized = normalizePath(path);
  return routes.find((r) => r.path === normalized);
}
