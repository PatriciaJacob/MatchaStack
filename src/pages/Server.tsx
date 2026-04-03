import { Link, RouteProps, ServerSidePropsContext } from '../router.js';

export async function getServerSideProps(context: ServerSidePropsContext) {
  const visitor = typeof context.query.name === 'string' ? context.query.name : 'friend';

  return {
    renderedAt: new Date().toISOString(),
    visitor,
    url: context.url,
  };
}

interface ServerProps extends RouteProps {
  renderedAt: string;
  visitor: string;
  url: string;
}

export default function Server(props: ServerProps) {
  return (
    <div>
      <h1>Server Page</h1>
      <p>This page uses getServerSideProps on every request.</p>
      <p>Visitor: {props.visitor}</p>
      <p>Rendered at: {props.renderedAt}</p>
      <p>Requested URL: {props.url}</p>
      <nav>
        <Link to="/">Go Home</Link>
      </nav>
    </div>
  );
}
