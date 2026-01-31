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
  navigate: (to: string) => void;
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
}

export function Router({ routes, initialPath }: RouterProps) {
  const [path, setPath] = React.useState(initialPath);

  const navigate = React.useCallback((to: string) => {
    window.history.pushState({}, '', to);
    setPath(to);
  }, []);

  // Handle browser back/forward
  React.useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
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
      <Component />
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

export function matchRoute(routes: Route[], path: string): Route | undefined {
  return routes.find((r) => r.path === path);
}
