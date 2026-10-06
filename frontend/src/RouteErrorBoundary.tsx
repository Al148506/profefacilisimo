import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Route-level safety net: an unexpected render crash (for example a future activity type that
 * `draftFromSaved` rejects) shows the standard error block instead of a blank page. The throw
 * itself is kept as a bug signal and logged here.
 */
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <section className="card">
      <div role="alert" className="error"><p>{this.state.error.message}</p></div>
      <Link className="button secondary pf-btn" to="/"><ArrowLeft aria-hidden="true" size={17} />Volver a Mis clases</Link>
    </section>;
  }
}
