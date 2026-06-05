import type { DashView } from '../types';

interface Props {
  views: DashView[];
  activeView: string;
  onJump: (id: string) => void;
}

/**
 * Slim page indicator for phone portrait, where the sidebar is hidden. Shows one
 * dot per page (active one elongated) so it's obvious there are other pages to
 * swipe to, and each dot is tappable to jump straight there. Hidden on wider
 * screens via CSS — the sidebar covers navigation there.
 */
export function PageDots({ views, activeView, onJump }: Props) {
  if (views.length < 2) return null;
  return (
    <nav className="page-dots" aria-label="Pages">
      {views.map((v) => {
        const active = v.id === activeView;
        return (
          <button
            key={v.id}
            type="button"
            className={`page-dot ${active ? 'active' : ''}`}
            aria-label={v.name}
            aria-current={active ? 'page' : undefined}
            title={v.name}
            onClick={() => onJump(v.id)}
          />
        );
      })}
    </nav>
  );
}
