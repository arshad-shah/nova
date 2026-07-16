import { type ReactNode, Children, isValidElement } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Box, Text } from '@/primitives'
import { CodeBlock } from './CodeBlock'
import { ActionChip } from './ActionChip'
import { parseActionHref } from '@/lib/app-actions/parse'

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!isValidElement(node)) return ''
  const children = (node.props as { children?: ReactNode }).children
  return Children.toArray(children).map(extractText).join('')
}

function extractLanguage(node: ReactNode): string | undefined {
  if (!isValidElement(node)) return undefined
  const className = (node.props as { className?: string }).className
  const match = className?.match(/language-(\w+)/)
  return match?.[1]
}

interface Props {
  content: string
}

export function MarkdownContent({ content }: Props) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      // react-markdown's default sanitizer strips unknown URL protocols, which
      // would drop our `verql://action/...` deep links. Let those through and
      // apply the default sanitization to everything else.
      urlTransform={(value) => (value.startsWith('verql://') ? value : defaultUrlTransform(value))}
      components={{
        pre: ({ children }) => {
          const code = extractText(children).replace(/\n$/, '')
          const lang = extractLanguage(
            Children.toArray(children).find(c => isValidElement(c)) as ReactNode
          )
          return <CodeBlock code={code} language={lang} />
        },
        code: ({ children, className }) => {
          const isBlock = className?.startsWith('language-')
          if (isBlock) {
            // Block code is handled by the pre override above
            return <code>{children}</code>
          }
          return (
            <code className="bg-[var(--color-bg-inset)] rounded px-1 py-0.5 text-xs text-[var(--color-accent)]">
              {children}
            </code>
          )
        },
        table: ({ children }) => (
          <Box className="overflow-x-auto my-1">
            <table className="w-full text-xs border-collapse border border-[var(--color-border)]">
              {children}
            </table>
          </Box>
        ),
        thead: ({ children }) => (
          <thead className="bg-[var(--color-bg-inset)]">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="border border-[var(--color-border)] px-2 py-1 text-left font-semibold text-[var(--color-text-secondary)]">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-[var(--color-border)] px-2 py-1">
            {children}
          </td>
        ),
        p: ({ children }) => <Text as="p" className="mb-1 last:mb-0">{children}</Text>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        a: ({ href, children }) => {
          // `verql://action/<id>` links are in-app deep links — render them as
          // clickable action chips routed through the App-Action registry
          // instead of opening a browser.
          const action = href ? parseActionHref(href) : null
          if (action) {
            return <ActionChip actionId={action.id} params={action.params}>{children}</ActionChip>
          }
          return (
            <a href={href} className="text-[var(--color-accent)] underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          )
        },
      }}
    >
      {content}
    </Markdown>
  )
}
