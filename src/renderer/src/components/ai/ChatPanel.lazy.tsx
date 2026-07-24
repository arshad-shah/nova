import { lazyComponent } from '@/components/common/lazyComponent'

/**
 * Lazy boundary for the AI chat panel. Import this from render sites so the
 * markdown/syntax-highlight stack it pulls in (`react-markdown`, `remark-gfm`,
 * `shiki`) loads on first use rather than at boot.
 */
export const ChatPanel = lazyComponent(() =>
  import('./ChatPanel').then((m) => ({ default: m.ChatPanel })),
)
