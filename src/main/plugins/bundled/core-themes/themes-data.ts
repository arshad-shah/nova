import type { RegisteredTheme } from '../../sdk/theme-registry'

// Ion is intentionally absent from this plugin — it's the app's brand theme
// *and* its default, so it ships with the shell rather than depending on a
// plugin activating. See `stores/themes.ts` (renderer) and
// `primitives/theme/baseline.css` for its definition.
//
// Nightshift was the brand theme before Ion. It's preserved here as an
// ordinary selectable theme so existing users keep their palette.

const NIGHTSHIFT_CSS = `
[data-theme="nightshift"] {
  --color-bg-primary: var(--raw-ink-900);
  --color-bg-secondary: var(--raw-ink-800);
  --color-bg-tertiary: var(--raw-ink-700);
  --color-bg-elevated: var(--raw-ink-600);

  --color-text-primary: var(--raw-ink-50);
  --color-text-secondary: var(--raw-ink-200);
  --color-text-tertiary: var(--raw-ink-300);
  --color-text-disabled: var(--raw-ink-400);
  --color-text-inverse: var(--raw-ink-900);

  --color-border-default: rgba(232, 236, 243, 0.08);
  --color-border-subtle: rgba(232, 236, 243, 0.04);
  --color-border-strong: rgba(232, 236, 243, 0.16);

  --color-accent: var(--raw-mint-400);
  --color-accent-hover: var(--raw-mint-300);
  --color-accent-muted: var(--raw-mint-900);
  --color-accent-emphasis: var(--raw-mint-500);

  --color-success: var(--raw-mint-400);
  --color-warning: var(--raw-amber-500);
  --color-error: var(--raw-red-500);
  --color-info: var(--raw-blue-500);

  --color-hover: rgba(232, 236, 243, 0.05);
  --color-active: rgba(232, 236, 243, 0.1);
  --color-focus-ring: var(--raw-mint-400);
  --color-disabled: var(--raw-ink-400);

  --shadow-input-inset: inset 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-dropdown: 0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-focus-glow: 0 0 0 3px rgba(43, 217, 163, 0.25);

  --color-skeleton-base: rgba(232, 236, 243, 0.10);
  --color-skeleton-highlight: rgba(232, 236, 243, 0.22);

  --color-input-gradient-top: rgba(232, 236, 243, 0.03);
  --color-input-gradient-bottom: transparent;
  --color-button-highlight: rgba(232, 236, 243, 0.1);
  --color-overlay-strong: rgba(0, 0, 0, 0.3);
  --color-overlay-soft: rgba(0, 0, 0, 0.2);

  --color-tab-bar-bg: var(--raw-ink-700);
  --color-tab-active-bg: var(--raw-ink-900);
  --color-tab-active-fg: var(--raw-ink-50);
  --color-tab-inactive-fg: var(--raw-ink-200);
  --color-tab-hover-bg: rgba(232, 236, 243, 0.06);
}
`.trim()

const LAB_CSS = `
[data-theme="lab"] {
  --color-bg-primary: var(--raw-paper-100);
  --color-bg-secondary: var(--raw-paper-200);
  --color-bg-tertiary: var(--raw-paper-200);
  --color-bg-elevated: var(--raw-paper-50);

  --color-text-primary: var(--raw-paper-900);
  --color-text-secondary: var(--raw-paper-500);
  --color-text-tertiary: var(--raw-paper-500);
  --color-text-disabled: var(--raw-paper-400);
  --color-text-inverse: var(--raw-paper-50);

  --color-border-default: rgba(26, 26, 28, 0.10);
  --color-border-subtle: rgba(26, 26, 28, 0.05);
  --color-border-strong: rgba(26, 26, 28, 0.18);

  --color-accent: var(--raw-teal-500);
  --color-accent-hover: var(--raw-teal-400);
  --color-accent-muted: rgba(17, 94, 89, 0.12);
  --color-accent-emphasis: var(--raw-teal-600);

  --color-success: var(--raw-teal-500);
  --color-warning: #B45309;
  --color-error: #B53A2A;
  --color-info: #1E5FA8;

  --color-hover: rgba(26, 26, 28, 0.04);
  --color-active: rgba(26, 26, 28, 0.08);
  --color-focus-ring: var(--raw-teal-500);
  --color-disabled: var(--raw-paper-400);

  --shadow-input-inset: inset 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-dropdown: 0 8px 24px rgba(0, 0, 0, 0.12);
  --shadow-focus-glow: 0 0 0 3px rgba(17, 94, 89, 0.2);

  --color-skeleton-base: rgba(26, 26, 28, 0.10);
  --color-skeleton-highlight: rgba(26, 26, 28, 0.20);

  --color-input-gradient-top: rgba(0, 0, 0, 0.015);
  --color-input-gradient-bottom: transparent;
  --color-button-highlight: rgba(255, 255, 255, 0.85);
  --color-overlay-strong: rgba(0, 0, 0, 0.08);
  --color-overlay-soft: rgba(0, 0, 0, 0.04);

  --color-tab-bar-bg: var(--raw-paper-300);
  --color-tab-active-bg: var(--raw-paper-100);
  --color-tab-active-fg: var(--raw-paper-900);
  --color-tab-inactive-fg: var(--raw-paper-500);
  --color-tab-hover-bg: rgba(26, 26, 28, 0.05);
}
`.trim()

const INKPAPER_CSS = `
[data-theme="inkpaper"] {
  --color-bg-primary: var(--raw-cream-200);
  --color-bg-secondary: var(--raw-cream-100);
  --color-bg-tertiary: var(--raw-cream-300);
  --color-bg-elevated: var(--raw-cream-50);

  --color-text-primary: var(--raw-cream-900);
  --color-text-secondary: var(--raw-cream-500);
  --color-text-tertiary: var(--raw-cream-500);
  --color-text-disabled: var(--raw-cream-400);
  --color-text-inverse: var(--raw-cream-50);

  --color-border-default: rgba(20, 17, 15, 0.10);
  --color-border-subtle: rgba(20, 17, 15, 0.05);
  --color-border-strong: rgba(20, 17, 15, 0.18);

  --color-accent: var(--raw-rust-500);
  --color-accent-hover: var(--raw-rust-400);
  --color-accent-muted: rgba(158, 48, 34, 0.12);
  --color-accent-emphasis: var(--raw-rust-600);

  --color-success: #5B7C3E;
  --color-warning: #8E5A1E;
  --color-error: var(--raw-rust-500);
  --color-info: #3C5A78;

  --color-hover: rgba(20, 17, 15, 0.04);
  --color-active: rgba(20, 17, 15, 0.08);
  --color-focus-ring: var(--raw-rust-500);
  --color-disabled: var(--raw-cream-400);

  --shadow-input-inset: inset 0 1px 2px rgba(20, 17, 15, 0.06);
  --shadow-card: 0 1px 3px rgba(20, 17, 15, 0.08);
  --shadow-elevated: 0 4px 12px rgba(20, 17, 15, 0.10);
  --shadow-dropdown: 0 8px 24px rgba(20, 17, 15, 0.14);
  --shadow-focus-glow: 0 0 0 3px rgba(158, 48, 34, 0.2);

  --color-skeleton-base: rgba(20, 17, 15, 0.10);
  --color-skeleton-highlight: rgba(20, 17, 15, 0.20);

  --color-input-gradient-top: rgba(20, 17, 15, 0.02);
  --color-input-gradient-bottom: transparent;
  --color-button-highlight: rgba(255, 255, 255, 0.7);
  --color-overlay-strong: rgba(20, 17, 15, 0.10);
  --color-overlay-soft: rgba(20, 17, 15, 0.05);

  --color-tab-bar-bg: var(--raw-cream-50);
  --color-tab-active-bg: var(--raw-cream-200);
  --color-tab-active-fg: var(--raw-cream-900);
  --color-tab-inactive-fg: var(--raw-cream-500);
  --color-tab-hover-bg: rgba(20, 17, 15, 0.05);
}
`.trim()

const DARK_CSS = `
[data-theme="dark"] {
  --color-bg-primary: var(--raw-neutral-900);
  --color-bg-secondary: var(--raw-neutral-850);
  --color-bg-tertiary: var(--raw-neutral-800);
  --color-bg-elevated: var(--raw-neutral-700);

  --color-text-primary: #ffffff;
  --color-text-secondary: var(--raw-neutral-400);
  --color-text-tertiary: var(--raw-neutral-500);
  --color-text-disabled: var(--raw-neutral-600);
  --color-text-inverse: var(--raw-neutral-900);

  --color-border-default: rgba(255, 255, 255, 0.08);
  --color-border-subtle: rgba(255, 255, 255, 0.04);
  --color-border-strong: rgba(255, 255, 255, 0.16);

  --color-accent: var(--raw-purple-500);
  --color-accent-hover: var(--raw-purple-400);
  --color-accent-muted: var(--raw-purple-900);
  --color-accent-emphasis: color-mix(in oklab, var(--color-accent), black 14%);

  --color-success: var(--raw-mint-400);
  --color-warning: var(--raw-amber-500);
  --color-error: var(--raw-red-500);
  --color-info: var(--raw-blue-500);

  --color-hover: rgba(255, 255, 255, 0.05);
  --color-active: rgba(255, 255, 255, 0.1);
  --color-focus-ring: var(--raw-purple-500);
  --color-disabled: var(--raw-neutral-600);
  --shadow-input-inset: inset 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.2);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-dropdown: 0 8px 24px rgba(0, 0, 0, 0.4);
  --shadow-focus-glow: 0 0 0 3px rgba(124, 111, 247, 0.25);
  --color-skeleton-base: rgba(255, 255, 255, 0.08);
  --color-skeleton-highlight: rgba(255, 255, 255, 0.18);
  --color-input-gradient-top: rgba(255, 255, 255, 0.03);
  --color-input-gradient-bottom: transparent;
  --color-button-highlight: rgba(255, 255, 255, 0.1);
  --color-overlay-strong: rgba(0, 0, 0, 0.3);
  --color-overlay-soft: rgba(0, 0, 0, 0.2);

  --color-tab-bar-bg: var(--raw-neutral-800);
  --color-tab-active-bg: var(--raw-neutral-900);
  --color-tab-active-fg: #ffffff;
  --color-tab-inactive-fg: var(--raw-neutral-400);
  --color-tab-hover-bg: rgba(255, 255, 255, 0.06);
}
`.trim()

const LIGHT_CSS = `
[data-theme="light"] {
  --color-bg-primary: #ffffff;
  --color-bg-secondary: var(--raw-neutral-50);
  --color-bg-tertiary: var(--raw-neutral-100);
  --color-bg-elevated: #ffffff;

  --color-text-primary: var(--raw-neutral-900);
  --color-text-secondary: var(--raw-neutral-500);
  --color-text-tertiary: var(--raw-neutral-400);
  --color-text-disabled: var(--raw-neutral-300);
  --color-text-inverse: #ffffff;

  --color-border-default: rgba(0, 0, 0, 0.08);
  --color-border-subtle: rgba(0, 0, 0, 0.04);
  --color-border-strong: rgba(0, 0, 0, 0.16);

  --color-accent: var(--raw-purple-500);
  --color-accent-hover: var(--raw-purple-600);
  --color-accent-muted: #f0eeff;
  --color-accent-emphasis: var(--raw-purple-600);

  --color-success: #137F5C;
  --color-warning: #B45309;
  --color-error: #B53A2A;
  --color-info: #1E5FA8;

  --color-hover: rgba(0, 0, 0, 0.04);
  --color-active: rgba(0, 0, 0, 0.08);
  --color-focus-ring: var(--raw-purple-500);
  --color-disabled: var(--raw-neutral-300);
  --shadow-input-inset: inset 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.1);
  --shadow-dropdown: 0 8px 24px rgba(0, 0, 0, 0.12);
  --shadow-focus-glow: 0 0 0 3px rgba(124, 111, 247, 0.2);
  --color-skeleton-base: rgba(13, 13, 26, 0.08);
  --color-skeleton-highlight: rgba(13, 13, 26, 0.18);
  --color-input-gradient-top: rgba(0, 0, 0, 0.02);
  --color-input-gradient-bottom: transparent;
  --color-button-highlight: rgba(255, 255, 255, 0.8);
  --color-overlay-strong: rgba(0, 0, 0, 0.1);
  --color-overlay-soft: rgba(0, 0, 0, 0.06);

  --color-tab-bar-bg: var(--raw-neutral-100);
  --color-tab-active-bg: #ffffff;
  --color-tab-active-fg: var(--raw-neutral-900);
  --color-tab-inactive-fg: var(--raw-neutral-500);
  --color-tab-hover-bg: rgba(0, 0, 0, 0.05);
}
`.trim()

const MIDNIGHT_CSS = `
[data-theme="midnight"] {
  --color-bg-primary: #0a0a12;
  --color-bg-secondary: #0e0e18;
  --color-bg-tertiary: #141422;
  --color-bg-elevated: #1e1e32;
  --color-text-primary: #e0e0f0;
  --color-text-secondary: #7878a0;
  --color-text-tertiary: #555578;
  --color-text-disabled: #3a3a55;
  --color-text-inverse: #0a0a12;
  --color-border-default: rgba(255, 255, 255, 0.06);
  --color-border-subtle: rgba(255, 255, 255, 0.03);
  --color-border-strong: rgba(255, 255, 255, 0.14);
  --color-accent: #8b7cf8;
  --color-accent-hover: #a89bf9;
  --color-accent-muted: #1a1533;
  --color-accent-emphasis: color-mix(in oklab, var(--color-accent), black 14%);
  --color-success: #34d399;
  --color-warning: #fbbf24;
  --color-error: #f87171;
  --color-info: #60a5fa;
  --color-hover: rgba(255, 255, 255, 0.04);
  --color-active: rgba(255, 255, 255, 0.08);
  --color-focus-ring: #8b7cf8;
  --color-disabled: #3a3a55;
  --shadow-input-inset: inset 0 1px 2px rgba(0, 0, 0, 0.5);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.5);
  --shadow-dropdown: 0 8px 24px rgba(0, 0, 0, 0.6);
  --shadow-focus-glow: 0 0 0 3px rgba(139, 124, 248, 0.25);
  --color-skeleton-base: rgba(224, 224, 240, 0.08);
  --color-skeleton-highlight: rgba(224, 224, 240, 0.18);
  --color-input-gradient-top: rgba(255, 255, 255, 0.02);
  --color-input-gradient-bottom: transparent;
  --color-button-highlight: rgba(255, 255, 255, 0.06);
  --color-overlay-strong: rgba(0, 0, 0, 0.4);
  --color-overlay-soft: rgba(0, 0, 0, 0.25);

  --color-tab-bar-bg: #141422;
  --color-tab-active-bg: #0a0a12;
  --color-tab-active-fg: #e0e0f0;
  --color-tab-inactive-fg: #7878a0;
  --color-tab-hover-bg: rgba(255, 255, 255, 0.05);
}
`.trim()

const DRACULA_CSS = `
[data-theme="dracula"] {
  --color-bg-primary: #282a36;
  --color-bg-secondary: #21222c;
  --color-bg-tertiary: #1e1f29;
  --color-bg-elevated: #44475a;
  --color-text-primary: #f8f8f2;
  --color-text-secondary: #6272a4;
  --color-text-tertiary: #4a5480;
  --color-text-disabled: #3a3f5c;
  --color-text-inverse: #282a36;
  --color-border-default: rgba(255, 255, 255, 0.08);
  --color-border-subtle: rgba(255, 255, 255, 0.04);
  --color-border-strong: rgba(255, 255, 255, 0.16);
  --color-accent: #bd93f9;
  --color-accent-hover: #caa9fa;
  --color-accent-muted: #2d2540;
  --color-accent-emphasis: color-mix(in oklab, var(--color-accent), black 14%);
  --color-success: #50fa7b;
  --color-warning: #f1fa8c;
  --color-error: #ff5555;
  --color-info: #8be9fd;
  --color-hover: rgba(255, 255, 255, 0.05);
  --color-active: rgba(255, 255, 255, 0.1);
  --color-focus-ring: #bd93f9;
  --color-disabled: #3a3f5c;
  --shadow-input-inset: inset 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.25);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.35);
  --shadow-dropdown: 0 8px 24px rgba(0, 0, 0, 0.45);
  --shadow-focus-glow: 0 0 0 3px rgba(189, 147, 249, 0.25);
  --color-skeleton-base: rgba(248, 248, 242, 0.08);
  --color-skeleton-highlight: rgba(248, 248, 242, 0.18);
  --color-input-gradient-top: rgba(255, 255, 255, 0.03);
  --color-input-gradient-bottom: transparent;
  --color-button-highlight: rgba(255, 255, 255, 0.1);
  --color-overlay-strong: rgba(0, 0, 0, 0.3);
  --color-overlay-soft: rgba(0, 0, 0, 0.2);

  --color-tab-bar-bg: #1e1f29;
  --color-tab-active-bg: #282a36;
  --color-tab-active-fg: #f8f8f2;
  --color-tab-inactive-fg: #6272a4;
  --color-tab-hover-bg: rgba(255, 255, 255, 0.05);
}
`.trim()

const NORD_CSS = `
[data-theme="nord"] {
  --color-bg-primary: #2e3440;
  --color-bg-secondary: #282e39;
  --color-bg-tertiary: #242933;
  --color-bg-elevated: #3b4252;
  --color-text-primary: #eceff4;
  --color-text-secondary: #4c566a;
  --color-text-tertiary: #434c5e;
  --color-text-disabled: #3b4252;
  --color-text-inverse: #2e3440;
  --color-border-default: rgba(255, 255, 255, 0.08);
  --color-border-subtle: rgba(255, 255, 255, 0.04);
  --color-border-strong: rgba(255, 255, 255, 0.16);
  --color-accent: #88c0d0;
  --color-accent-hover: #8fbcbb;
  --color-accent-muted: #1e2a30;
  --color-accent-emphasis: color-mix(in oklab, var(--color-accent), black 14%);
  --color-success: #a3be8c;
  --color-warning: #ebcb8b;
  --color-error: #bf616a;
  --color-info: #81a1c1;
  --color-hover: rgba(255, 255, 255, 0.04);
  --color-active: rgba(255, 255, 255, 0.08);
  --color-focus-ring: #88c0d0;
  --color-disabled: #3b4252;
  --shadow-input-inset: inset 0 1px 2px rgba(0, 0, 0, 0.25);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.2);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.25);
  --shadow-dropdown: 0 8px 24px rgba(0, 0, 0, 0.35);
  --shadow-focus-glow: 0 0 0 3px rgba(136, 192, 208, 0.25);
  --color-skeleton-base: rgba(236, 239, 244, 0.08);
  --color-skeleton-highlight: rgba(236, 239, 244, 0.18);
  --color-input-gradient-top: rgba(255, 255, 255, 0.02);
  --color-input-gradient-bottom: transparent;
  --color-button-highlight: rgba(255, 255, 255, 0.08);
  --color-overlay-strong: rgba(0, 0, 0, 0.25);
  --color-overlay-soft: rgba(0, 0, 0, 0.15);

  --color-tab-bar-bg: #242933;
  --color-tab-active-bg: #2e3440;
  --color-tab-active-fg: #eceff4;
  --color-tab-inactive-fg: #4c566a;
  --color-tab-hover-bg: rgba(255, 255, 255, 0.04);
}
`.trim()

const SOLARIZED_CSS = `
[data-theme="solarized"] {
  --color-bg-primary: #002b36;
  --color-bg-secondary: #001e26;
  --color-bg-tertiary: #00161d;
  --color-bg-elevated: #073642;
  --color-text-primary: #fdf6e3;
  --color-text-secondary: #586e75;
  --color-text-tertiary: #465a61;
  --color-text-disabled: #2e4449;
  --color-text-inverse: #002b36;
  --color-border-default: rgba(255, 255, 255, 0.08);
  --color-border-subtle: rgba(255, 255, 255, 0.04);
  --color-border-strong: rgba(255, 255, 255, 0.16);
  --color-accent: #268bd2;
  --color-accent-hover: #2aa198;
  --color-accent-muted: #0a2a3a;
  --color-accent-emphasis: color-mix(in oklab, var(--color-accent), black 14%);
  --color-success: #859900;
  --color-warning: #b58900;
  --color-error: #dc322f;
  --color-info: #268bd2;
  --color-hover: rgba(255, 255, 255, 0.04);
  --color-active: rgba(255, 255, 255, 0.08);
  --color-focus-ring: #268bd2;
  --color-disabled: #2e4449;
  --shadow-input-inset: inset 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.25);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.35);
  --shadow-dropdown: 0 8px 24px rgba(0, 0, 0, 0.45);
  --shadow-focus-glow: 0 0 0 3px rgba(38, 139, 210, 0.25);
  --color-skeleton-base: rgba(253, 246, 227, 0.08);
  --color-skeleton-highlight: rgba(253, 246, 227, 0.18);
  --color-input-gradient-top: rgba(255, 255, 255, 0.03);
  --color-input-gradient-bottom: transparent;
  --color-button-highlight: rgba(255, 255, 255, 0.08);
  --color-overlay-strong: rgba(0, 0, 0, 0.3);
  --color-overlay-soft: rgba(0, 0, 0, 0.2);

  --color-tab-bar-bg: #001e26;
  --color-tab-active-bg: #002b36;
  --color-tab-active-fg: #fdf6e3;
  --color-tab-inactive-fg: #586e75;
  --color-tab-hover-bg: rgba(253, 246, 227, 0.05);
}
`.trim()

const CATPPUCCIN_CSS = `
[data-theme="catppuccin"] {
  --color-bg-primary: #1e1e2e;
  --color-bg-secondary: #181825;
  --color-bg-tertiary: #11111b;
  --color-bg-elevated: #313244;
  --color-text-primary: #cdd6f4;
  --color-text-secondary: #585b70;
  --color-text-tertiary: #45475a;
  --color-text-disabled: #313244;
  --color-text-inverse: #1e1e2e;
  --color-border-default: rgba(255, 255, 255, 0.08);
  --color-border-subtle: rgba(255, 255, 255, 0.04);
  --color-border-strong: rgba(255, 255, 255, 0.16);
  --color-accent: #cba6f7;
  --color-accent-hover: #b4befe;
  --color-accent-muted: #2a2240;
  --color-accent-emphasis: color-mix(in oklab, var(--color-accent), black 14%);
  --color-success: #a6e3a1;
  --color-warning: #f9e2af;
  --color-error: #f38ba8;
  --color-info: #89b4fa;
  --color-hover: rgba(255, 255, 255, 0.04);
  --color-active: rgba(255, 255, 255, 0.08);
  --color-focus-ring: #cba6f7;
  --color-disabled: #313244;
  --shadow-input-inset: inset 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.2);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-dropdown: 0 8px 24px rgba(0, 0, 0, 0.4);
  --shadow-focus-glow: 0 0 0 3px rgba(203, 166, 247, 0.25);
  --color-skeleton-base: rgba(205, 214, 244, 0.08);
  --color-skeleton-highlight: rgba(205, 214, 244, 0.18);
  --color-input-gradient-top: rgba(255, 255, 255, 0.03);
  --color-input-gradient-bottom: transparent;
  --color-button-highlight: rgba(255, 255, 255, 0.08);
  --color-overlay-strong: rgba(0, 0, 0, 0.3);
  --color-overlay-soft: rgba(0, 0, 0, 0.2);

  --color-tab-bar-bg: #11111b;
  --color-tab-active-bg: #1e1e2e;
  --color-tab-active-fg: #cdd6f4;
  --color-tab-inactive-fg: #585b70;
  --color-tab-hover-bg: rgba(255, 255, 255, 0.04);
}
`.trim()

// Monaco rule sets — one per theme. Compact since they're token→colour maps.
const MONACO = {
  nightshift: {
    base: 'vs-dark' as const,
    colors: { 'editor.background': '#0B0F16', 'editor.foreground': '#E8ECF3', 'editor.lineHighlightBackground': '#E8ECF30A', 'editor.selectionBackground': '#2BD9A340', 'editorLineNumber.foreground': '#4A5468', 'editorCursor.foreground': '#2BD9A3', 'editor.selectionHighlightBackground': '#2BD9A320', 'editorBracketMatch.background': '#2BD9A330', 'editorBracketMatch.border': '#2BD9A350' },
    rules: [{ token: 'keyword', foreground: '#2BD9A3' }, { token: 'string', foreground: '#FFB23D' }, { token: 'number', foreground: '#FFC061' }, { token: 'comment', foreground: '#4A5468', fontStyle: 'italic' }, { token: 'type', foreground: '#5CE0BD' }, { token: 'identifier', foreground: '#E8ECF3' }, { token: 'operator', foreground: '#7C8499' }, { token: 'delimiter', foreground: '#B8C0D1' }]
  },
  lab: {
    base: 'vs' as const,
    colors: { 'editor.background': '#FAFAF6', 'editor.foreground': '#1A1A1C', 'editor.lineHighlightBackground': '#1A1A1C08', 'editor.selectionBackground': '#115E5930', 'editorLineNumber.foreground': '#BFBDB4', 'editorCursor.foreground': '#115E59', 'editor.selectionHighlightBackground': '#115E5915', 'editorBracketMatch.background': '#115E5920', 'editorBracketMatch.border': '#115E5940' },
    rules: [{ token: 'keyword', foreground: '#115E59' }, { token: 'string', foreground: '#B45309' }, { token: 'number', foreground: '#9A4F0B' }, { token: 'comment', foreground: '#6B6B68', fontStyle: 'italic' }, { token: 'type', foreground: '#14716A' }, { token: 'identifier', foreground: '#1A1A1C' }, { token: 'operator', foreground: '#6B6B68' }, { token: 'delimiter', foreground: '#1A1A1C' }]
  },
  inkpaper: {
    base: 'vs' as const,
    colors: { 'editor.background': '#F8F2E5', 'editor.foreground': '#14110F', 'editor.lineHighlightBackground': '#14110F08', 'editor.selectionBackground': '#9E302230', 'editorLineNumber.foreground': '#BFB29A', 'editorCursor.foreground': '#9E3022', 'editor.selectionHighlightBackground': '#9E302215', 'editorBracketMatch.background': '#9E302220', 'editorBracketMatch.border': '#9E302240' },
    rules: [{ token: 'keyword', foreground: '#9E3022' }, { token: 'string', foreground: '#6B4226' }, { token: 'number', foreground: '#8E5A1E' }, { token: 'comment', foreground: '#6D6759', fontStyle: 'italic' }, { token: 'type', foreground: '#B23A2A' }, { token: 'identifier', foreground: '#14110F' }, { token: 'operator', foreground: '#6D6759' }, { token: 'delimiter', foreground: '#14110F' }]
  },
  dark: {
    base: 'vs-dark' as const,
    colors: { 'editor.background': '#0d0d1a', 'editor.foreground': '#ffffff', 'editor.lineHighlightBackground': '#ffffff0d', 'editor.selectionBackground': '#7c6ff740', 'editorLineNumber.foreground': '#666666', 'editorCursor.foreground': '#7c6ff7', 'editor.selectionHighlightBackground': '#7c6ff720', 'editorBracketMatch.background': '#7c6ff730', 'editorBracketMatch.border': '#7c6ff750' },
    rules: [{ token: 'keyword', foreground: '#c678dd' }, { token: 'string', foreground: '#98c379' }, { token: 'number', foreground: '#d19a66' }, { token: 'comment', foreground: '#5c6370', fontStyle: 'italic' }, { token: 'type', foreground: '#e5c07b' }, { token: 'identifier', foreground: '#61afef' }, { token: 'operator', foreground: '#56b6c2' }, { token: 'delimiter', foreground: '#abb2bf' }]
  },
  light: {
    base: 'vs' as const,
    colors: { 'editor.background': '#ffffff', 'editor.foreground': '#0d0d1a', 'editor.lineHighlightBackground': '#0000000a', 'editor.selectionBackground': '#7c6ff730', 'editorLineNumber.foreground': '#888888', 'editorCursor.foreground': '#7c6ff7', 'editor.selectionHighlightBackground': '#7c6ff715', 'editorBracketMatch.background': '#7c6ff720', 'editorBracketMatch.border': '#7c6ff740' },
    rules: [{ token: 'keyword', foreground: '#a626a4' }, { token: 'string', foreground: '#50a14f' }, { token: 'number', foreground: '#986801' }, { token: 'comment', foreground: '#a0a1a7', fontStyle: 'italic' }, { token: 'type', foreground: '#c18401' }, { token: 'identifier', foreground: '#4078f2' }, { token: 'operator', foreground: '#0184bc' }, { token: 'delimiter', foreground: '#383a42' }]
  },
  midnight: {
    base: 'vs-dark' as const,
    colors: { 'editor.background': '#0a0a12', 'editor.foreground': '#e0e0f0', 'editor.lineHighlightBackground': '#ffffff0a', 'editor.selectionBackground': '#8b7cf840', 'editorLineNumber.foreground': '#555578', 'editorCursor.foreground': '#8b7cf8', 'editor.selectionHighlightBackground': '#8b7cf820', 'editorBracketMatch.background': '#8b7cf830', 'editorBracketMatch.border': '#8b7cf850' },
    rules: [{ token: 'keyword', foreground: '#c678dd' }, { token: 'string', foreground: '#98c379' }, { token: 'number', foreground: '#d19a66' }, { token: 'comment', foreground: '#555578', fontStyle: 'italic' }, { token: 'type', foreground: '#e5c07b' }, { token: 'identifier', foreground: '#61afef' }, { token: 'operator', foreground: '#56b6c2' }, { token: 'delimiter', foreground: '#a0a0c0' }]
  },
  dracula: {
    base: 'vs-dark' as const,
    colors: { 'editor.background': '#282a36', 'editor.foreground': '#f8f8f2', 'editor.lineHighlightBackground': '#ffffff0a', 'editor.selectionBackground': '#bd93f940', 'editorLineNumber.foreground': '#6272a4', 'editorCursor.foreground': '#f8f8f2', 'editor.selectionHighlightBackground': '#bd93f920', 'editorBracketMatch.background': '#bd93f930', 'editorBracketMatch.border': '#bd93f950' },
    rules: [{ token: 'keyword', foreground: '#ff79c6' }, { token: 'string', foreground: '#f1fa8c' }, { token: 'number', foreground: '#bd93f9' }, { token: 'comment', foreground: '#6272a4', fontStyle: 'italic' }, { token: 'type', foreground: '#8be9fd', fontStyle: 'italic' }, { token: 'identifier', foreground: '#50fa7b' }, { token: 'operator', foreground: '#ff79c6' }, { token: 'delimiter', foreground: '#f8f8f2' }]
  },
  nord: {
    base: 'vs-dark' as const,
    colors: { 'editor.background': '#2e3440', 'editor.foreground': '#d8dee9', 'editor.lineHighlightBackground': '#ffffff08', 'editor.selectionBackground': '#88c0d040', 'editorLineNumber.foreground': '#4c566a', 'editorCursor.foreground': '#d8dee9', 'editor.selectionHighlightBackground': '#88c0d020', 'editorBracketMatch.background': '#88c0d030', 'editorBracketMatch.border': '#88c0d050' },
    rules: [{ token: 'keyword', foreground: '#81a1c1' }, { token: 'string', foreground: '#a3be8c' }, { token: 'number', foreground: '#b48ead' }, { token: 'comment', foreground: '#4c566a', fontStyle: 'italic' }, { token: 'type', foreground: '#8fbcbb' }, { token: 'identifier', foreground: '#88c0d0' }, { token: 'operator', foreground: '#81a1c1' }, { token: 'delimiter', foreground: '#eceff4' }]
  },
  solarized: {
    base: 'vs-dark' as const,
    colors: { 'editor.background': '#002b36', 'editor.foreground': '#839496', 'editor.lineHighlightBackground': '#ffffff08', 'editor.selectionBackground': '#268bd240', 'editorLineNumber.foreground': '#586e75', 'editorCursor.foreground': '#839496', 'editor.selectionHighlightBackground': '#268bd220', 'editorBracketMatch.background': '#268bd230', 'editorBracketMatch.border': '#268bd250' },
    rules: [{ token: 'keyword', foreground: '#859900' }, { token: 'string', foreground: '#2aa198' }, { token: 'number', foreground: '#d33682' }, { token: 'comment', foreground: '#586e75', fontStyle: 'italic' }, { token: 'type', foreground: '#b58900' }, { token: 'identifier', foreground: '#268bd2' }, { token: 'operator', foreground: '#859900' }, { token: 'delimiter', foreground: '#93a1a1' }]
  },
  catppuccin: {
    base: 'vs-dark' as const,
    colors: { 'editor.background': '#1e1e2e', 'editor.foreground': '#cdd6f4', 'editor.lineHighlightBackground': '#ffffff08', 'editor.selectionBackground': '#cba6f740', 'editorLineNumber.foreground': '#585b70', 'editorCursor.foreground': '#f5e0dc', 'editor.selectionHighlightBackground': '#cba6f720', 'editorBracketMatch.background': '#cba6f730', 'editorBracketMatch.border': '#cba6f750' },
    rules: [{ token: 'keyword', foreground: '#cba6f7' }, { token: 'string', foreground: '#a6e3a1' }, { token: 'number', foreground: '#fab387' }, { token: 'comment', foreground: '#585b70', fontStyle: 'italic' }, { token: 'type', foreground: '#f9e2af' }, { token: 'identifier', foreground: '#89b4fa' }, { token: 'operator', foreground: '#89dceb' }, { token: 'delimiter', foreground: '#bac2de' }]
  }
}

export const CORE_THEMES: RegisteredTheme[] = [
  { id: 'nightshift', name: 'Nightshift', type: 'dark', css: NIGHTSHIFT_CSS, monaco: MONACO.nightshift, preview: { bg: '#0B0F16', sidebar: '#131825', text: '#E8ECF3', accent: '#2bd9a3' } },
  { id: 'lab', name: 'Lab', type: 'light', css: LAB_CSS, monaco: MONACO.lab, preview: { bg: '#FAFAF6', sidebar: '#F1F0EA', text: '#1A1A1C', accent: '#115E59' } },
  { id: 'inkpaper', name: 'Ink & Paper', type: 'light', css: INKPAPER_CSS, monaco: MONACO.inkpaper, preview: { bg: '#F2EBDE', sidebar: '#ECE3D2', text: '#14110F', accent: '#9E3022' } },
  { id: 'dark', name: 'Dark', type: 'dark', css: DARK_CSS, monaco: MONACO.dark, preview: { bg: '#1e1e2e', sidebar: '#313244', text: '#cdd6f4', accent: '#b4befe' } },
  { id: 'light', name: 'Light', type: 'light', css: LIGHT_CSS, monaco: MONACO.light, preview: { bg: '#eff1f5', sidebar: '#ccd0da', text: '#4c4f69', accent: '#7287fd' } },
  { id: 'midnight', name: 'Midnight', type: 'dark', css: MIDNIGHT_CSS, monaco: MONACO.midnight, preview: { bg: '#0d1117', sidebar: '#161b22', text: '#c9d1d9', accent: '#a78bfa' } },
  { id: 'dracula', name: 'Dracula', type: 'dark', css: DRACULA_CSS, monaco: MONACO.dracula, preview: { bg: '#282a36', sidebar: '#44475a', text: '#f8f8f2', accent: '#bd93f9' } },
  { id: 'nord', name: 'Nord', type: 'dark', css: NORD_CSS, monaco: MONACO.nord, preview: { bg: '#2e3440', sidebar: '#3b4252', text: '#eceff4', accent: '#88c0d0' } },
  { id: 'solarized', name: 'Solarized', type: 'dark', css: SOLARIZED_CSS, monaco: MONACO.solarized, preview: { bg: '#002b36', sidebar: '#073642', text: '#839496', accent: '#268bd2' } },
  { id: 'catppuccin', name: 'Catppuccin', type: 'dark', css: CATPPUCCIN_CSS, monaco: MONACO.catppuccin, preview: { bg: '#1e1e2e', sidebar: '#313244', text: '#cdd6f4', accent: '#f5c2e7' } }
]
