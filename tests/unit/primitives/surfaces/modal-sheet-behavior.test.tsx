import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React from 'react'
import { Modal } from '@/primitives/surfaces/Modal'
import { Sheet } from '@/primitives/surfaces/Sheet'

/**
 * Behavioural tests for Modal/Sheet's native-<dialog> wiring: backdrop click
 * vs. content click, the native `close` event (what a real Escape produces),
 * and Modal's guard against re-firing `onClose` when it closes itself.
 *
 * `dialog.test.tsx` overrides `HTMLDialogElement.prototype.close` with a bare
 * `vi.fn()` in its own file, so it never exercises the native `close` event
 * these tests rely on — that's provided by the global stub in tests/setup.ts,
 * which this file leaves untouched.
 */

describe('Modal — backdrop vs content click', () => {
  it('calls onClose when the click lands on the dialog backdrop itself', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Modal open onClose={onClose}>
        <button>inside</button>
      </Modal>
    )
    fireEvent.click(container.querySelector('dialog')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the click lands on content inside the dialog', () => {
    const onClose = vi.fn()
    const { getByText } = render(
      <Modal open onClose={onClose}>
        <button>inside</button>
      </Modal>
    )
    fireEvent.click(getByText('inside'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Modal — native close event (Escape)', () => {
  it('calls onClose when the browser dispatches a native close event while still open', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Modal open onClose={onClose}>
        content
      </Modal>
    )
    fireEvent(container.querySelector('dialog')!, new Event('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT re-fire onClose when the parent closes the modal itself (closingRef guard)', () => {
    // dialog.close() synchronously dispatches its own 'close' event (per the
    // setup.ts stub, matching real <dialog> behaviour). Without the guard,
    // every caller-initiated close would double-invoke onClose.
    const onClose = vi.fn()
    const { rerender } = render(
      <Modal open onClose={onClose}>
        content
      </Modal>
    )
    rerender(
      <Modal open={false} onClose={onClose}>
        content
      </Modal>
    )
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Modal — position variant', () => {
  it('applies the centered position by default', () => {
    const { container } = render(
      <Modal open onClose={() => {}}>
        content
      </Modal>
    )
    expect(container.querySelector('dialog')).toHaveClass('inset-0', 'm-auto')
  })

  it('applies the top position when requested', () => {
    const { container } = render(
      <Modal open onClose={() => {}} position="top">
        content
      </Modal>
    )
    const dialog = container.querySelector('dialog')!
    expect(dialog).toHaveClass('top-[15%]')
    expect(dialog).not.toHaveClass('inset-0')
  })
})

describe('Sheet — backdrop vs content click', () => {
  it('calls onClose when the click lands on the dialog backdrop itself', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Sheet open onClose={onClose}>
        <button>inside</button>
      </Sheet>
    )
    fireEvent.click(container.querySelector('dialog')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the click lands on content inside the sheet', () => {
    const onClose = vi.fn()
    const { getByText } = render(
      <Sheet open onClose={onClose}>
        <button>inside</button>
      </Sheet>
    )
    fireEvent.click(getByText('inside'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Sheet — native close event (Escape)', () => {
  it('calls onClose when the browser dispatches a native close event while still open', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Sheet open onClose={onClose}>
        content
      </Sheet>
    )
    fireEvent(container.querySelector('dialog')!, new Event('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // BUG: unlike Modal, Sheet wires the native `close` event straight to
  // `onClose` with no closingRef-style guard. A realistic parent does
  // `onClose={() => setOpen(false)}`: the backdrop click below fires onClose
  // once (correct), which flips `open` to false; the resulting `dialog.close()`
  // in the effect synchronously re-fires the native `close` event, invoking
  // `onClose` a SECOND time for what was one logical user action. Modal's
  // closingRef guard (see above) exists precisely to prevent this.
  it('BUG: onClose fires twice for one user close — once from the click, again from the resulting close()', () => {
    const onClose = vi.fn()
    const { container, rerender } = render(
      <Sheet open onClose={onClose}>
        content
      </Sheet>
    )
    fireEvent.click(container.querySelector('dialog')!) // user-initiated backdrop close
    expect(onClose).toHaveBeenCalledTimes(1)

    // The parent reacts to that single onClose by setting open=false.
    rerender(
      <Sheet open={false} onClose={onClose}>
        content
      </Sheet>
    )
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('Sheet — side variant', () => {
  it('applies the right-side classes by default', () => {
    const { container } = render(
      <Sheet open onClose={() => {}}>
        content
      </Sheet>
    )
    expect(container.querySelector('dialog')).toHaveClass('right-0')
  })

  it('applies the bottom-side classes when requested', () => {
    const { container } = render(
      <Sheet open onClose={() => {}} side="bottom">
        content
      </Sheet>
    )
    const dialog = container.querySelector('dialog')!
    expect(dialog).toHaveClass('bottom-0', 'w-full')
    expect(dialog).not.toHaveClass('right-0')
  })
})
