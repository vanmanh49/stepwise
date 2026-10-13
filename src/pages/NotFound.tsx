import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-28 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="text-muted">The lesson may be planned but not written yet, or the link may be mistyped.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link to="/data-structures" className="btn">
          Data Structures
        </Link>
        <Link to="/algorithms" className="btn">
          Algorithms
        </Link>
        <Link to="/" className="btn btn-primary">
          Home
        </Link>
      </div>
    </div>
  );
}
