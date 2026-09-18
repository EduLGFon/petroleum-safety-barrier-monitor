// ErrorBoundary - catches render crashes in island subtrees.
// This is why it exists: fetch errors already render ServerErrorCard/Banner,
// but a render throw would blank the page; this boundary shows a PT fallback
// with retry instead.
import { Component, type ComponentChildren } from "preact";

interface Props {
  children: ComponentChildren;
}

interface State {
  error: string | null;
}

// ErrorBoundary: Preact class boundary; resets on retry click.
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static override getDerivedStateFromError(err: unknown): State {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  override componentDidCatch(err: unknown): void {
    console.error("[ErrorBoundary]", err);
  }

  override render() {
    if (this.state.error) {
      return (
        <div role="alert" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Algo deu errado ao renderizar
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginBottom: 12,
            }}
          >
            Tente recarregar a seção
          </div>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
