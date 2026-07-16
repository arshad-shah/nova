import { type ReactNode, Children, isValidElement } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Box, Text, Table, List, Link, Code } from '@/primitives'
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
            return <Code>{children}</Code>
          }
          return <Code className="text-accent">{children}</Code>
        },
        table: ({ children }) => (
          <Box className="overflow-x-auto my-1">
            <Table className="text-xs border-collapse border border-border">
              {children}
            </Table>
          </Box>
        ),
        thead: ({ children }) => <Table.Header>{children}</Table.Header>,
        th: ({ children }) => (
          <Table.Head size="sm" className="border border-border font-semibold">
            {children}
          </Table.Head>
        ),
        td: ({ children }) => (
          <Table.Cell size="sm" className="border border-border">
            {children}
          </Table.Cell>
        ),
        p: ({ children }) => <Text as="p" className="mb-1 last:mb-0">{children}</Text>,
        ul: ({ children }) => <List marker="disc" className="mb-1">{children}</List>,
        ol: ({ children }) => <List ordered marker="decimal" className="mb-1">{children}</List>,
        li: ({ children }) => <List.Item size="none" className="mb-0.5">{children}</List.Item>,
        strong: ({ children }) => <Text as="strong" weight="semibold">{children}</Text>,
        a: ({ href, children }) => {
          // `verql://action/<id>` links are in-app deep links — render them as
          // clickable action chips routed through the App-Action registry
          // instead of opening a browser.
          const action = href ? parseActionHref(href) : null
          if (action) {
            return <ActionChip actionId={action.id} params={action.params}>{children}</ActionChip>
          }
          return (
            <Link href={href} size="sm" className="underline" target="_blank" rel="noopener noreferrer">
              {children}
            </Link>
          )
        },
      }}
    >
      {content}
    </Markdown>
  )
}
