// The renderer boot sequence (src/renderer/src/lib/boot.ts) and the static
// boot-splash teardown (lib/boot-splash.ts).
//
// Both exist because of one bug class: a boot that fails, or a splash that is
// never dismissed, is invisible to the user as anything other than "the app is
// stuck on the splash screen". These tests pin the behaviour that makes that
// impossible — a fatal failure is reported rather than swallowed, a non-fatal
// one is stepped over rather than fatal, and the splash comes down even when
// animation frames never run.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runRendererBoot, type RendererBootSteps } from '@/lib/boot'
import {
  dismissBootSplash,
  scheduleBootSplashDismissal,
  BOOT_SPLASH_MAX_MS,
} from '@/lib/boot-splash'

function steps(overrides: Partial<RendererBootSteps> = {}): RendererBootSteps & {
  onFatal: ReturnType<typeof vi.fn>
  onRecoverable: ReturnType<typeof vi.fn>
} {
  return {
    migrateLegacyPreferences: vi.fn(async () => {}),
    hydrateSettings: vi.fn(async () => {}),
    afterHydrate: vi.fn(async () => {}),
    onFatal: vi.fn(),
    onRecoverable: vi.fn(),
    ...overrides,
  } as never
}

describe('runRendererBoot', () => {
  it('runs the phases in order and reports success', async () => {
    const order: string[] = []
    const s = steps({
      migrateLegacyPreferences: vi.fn(async () => { order.push('migrate') }),
      hydrateSettings: vi.fn(async () => { order.push('hydrate') }),
      afterHydrate: vi.fn(async () => { order.push('after') }),
    })
    await expect(runRendererBoot(s)).resolves.toBe(true)
    expect(order).toEqual(['migrate', 'hydrate', 'after'])
    expect(s.onFatal).not.toHaveBeenCalled()
    expect(s.onRecoverable).not.toHaveBeenCalled()
  })

  it('reports a failed settings hydrate as fatal instead of swallowing it', async () => {
    // The regression this guards: a rejected hydrate left `loaded` false, so
    // <SplashScreen> stayed up forever and the error vanished into an
    // unhandled rejection. It must reach onFatal, which the UI renders.
    const boom = new Error('Backend unavailable: cannot invoke "settings:get-all"')
    const s = steps({ hydrateSettings: vi.fn(async () => { throw boom }) })
    await expect(runRendererBoot(s)).resolves.toBe(false)
    expect(s.onFatal).toHaveBeenCalledWith(boom)
  })

  it('normalizes a non-Error rejection so onFatal always gets an Error', async () => {
    const s = steps({ hydrateSettings: vi.fn(async () => { throw 'string failure' }) })
    await runRendererBoot(s)
    const [received] = s.onFatal.mock.calls[0] as [Error]
    expect(received).toBeInstanceOf(Error)
    expect(received.message).toBe('string failure')
  })

  it('skips the post-hydrate phase entirely when hydrate failed', async () => {
    const s = steps({ hydrateSettings: vi.fn(async () => { throw new Error('nope') }) })
    await runRendererBoot(s)
    expect(s.afterHydrate).not.toHaveBeenCalled()
  })

  it('treats a failed legacy migration as recoverable and still boots', async () => {
    const s = steps({ migrateLegacyPreferences: vi.fn(async () => { throw new Error('write failed') }) })
    await expect(runRendererBoot(s)).resolves.toBe(true)
    expect(s.onRecoverable).toHaveBeenCalledWith('legacy preference migration', expect.any(Error))
    expect(s.hydrateSettings).toHaveBeenCalled()
    expect(s.onFatal).not.toHaveBeenCalled()
  })

  it('keeps the app usable when post-hydrate startup fails', async () => {
    // Tab restore, diagnostics and onboarding run after the shell is on
    // screen. Losing one of them must cost that feature, not the window.
    const s = steps({ afterHydrate: vi.fn(async () => { throw new Error('tab restore failed') }) })
    await expect(runRendererBoot(s)).resolves.toBe(true)
    expect(s.onRecoverable).toHaveBeenCalledWith('post-hydrate startup', expect.any(Error))
    expect(s.onFatal).not.toHaveBeenCalled()
  })

  it('never rejects, so callers can void it without an unhandled rejection', async () => {
    const s = steps({
      migrateLegacyPreferences: vi.fn(async () => { throw new Error('a') }),
      hydrateSettings: vi.fn(async () => { throw new Error('b') }),
    })
    await expect(runRendererBoot(s)).resolves.toBe(false)
  })
})

describe('boot splash teardown', () => {
  let splash: HTMLElement

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="boot-splash"></div><div id="root"></div>'
    splash = document.getElementById('boot-splash')!
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('fades then removes the splash', () => {
    dismissBootSplash(document)
    expect(splash.classList.contains('boot-splash--leaving')).toBe(true)
    expect(document.getElementById('boot-splash')).not.toBeNull()
    vi.runAllTimers()
    expect(document.getElementById('boot-splash')).toBeNull()
  })

  it('is a no-op when the splash is already gone', () => {
    dismissBootSplash(document)
    vi.runAllTimers()
    expect(() => dismissBootSplash(document)).not.toThrow()
  })

  it('dismisses via animation frames when they run', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    scheduleBootSplashDismissal(document)
    // Double rAF: the first schedules the second, which does the work.
    frames[0](0)
    frames[1](0)
    vi.runAllTimers()
    expect(document.getElementById('boot-splash')).toBeNull()
  })

  it('still dismisses when animation frames never fire', () => {
    // Chromium does not service animation frames for an occluded or minimised
    // window. Without the timer backstop the splash — full-window, z-index
    // 9999 and a drag region — would sit undismissable over a healthy app.
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})

    scheduleBootSplashDismissal(document)
    expect(document.getElementById('boot-splash')).not.toBeNull()
    vi.advanceTimersByTime(BOOT_SPLASH_MAX_MS)
    vi.runAllTimers()
    expect(document.getElementById('boot-splash')).toBeNull()
  })

  it('survives both paths racing to dismiss the same element', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    scheduleBootSplashDismissal(document)
    frames[0](0)
    frames[1](0)
    vi.advanceTimersByTime(BOOT_SPLASH_MAX_MS)
    expect(() => vi.runAllTimers()).not.toThrow()
    expect(document.getElementById('boot-splash')).toBeNull()
  })

  it('cancel() stops a pending dismissal', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})

    const cancel = scheduleBootSplashDismissal(document)
    cancel()
    vi.runAllTimers()
    expect(document.getElementById('boot-splash')).not.toBeNull()
  })
})
