import { useState } from 'react'
import {
  History, Plus, Trash2, Pencil, Check, X, Sparkles,
  Minimize2, MoreHorizontal, ChevronDown,
} from 'lucide-react'
import { Spinner } from '@/primitives/feedback/Spinner'
import { Progress } from '@/primitives/feedback/Progress'
import { useAIStore } from '@/stores/ai'
import { Flex, Text, Input, IconButton, Box, Button } from '@/primitives'
import { Tooltip } from '@/primitives/surfaces/Tooltip'
import { DropdownMenu } from '@/primitives/surfaces/DropdownMenu'
import { Menu } from '@/primitives/surfaces/menu'
import type { MenuNode } from '@/primitives/surfaces/menu/types'
import { formatCompactNumber } from '@/lib/format'
import { useTranslation } from '@/i18n/I18nProvider'

/**
 * Top of the chat panel. Combines conversation switcher, model name, and a
 * prominent context-window indicator showing how much budget is left for the
 * current conversation. Compact button summarises the older turns into a
 * single system message to free up context.
 */
export function ChatPanelHeader() {
  const { t } = useTranslation()
  const conversations = useAIStore((s) => s.conversations)
  const activeId = useAIStore((s) => s.activeConversationId)
  const newConversation = useAIStore((s) => s.newConversation)
  const switchConversation = useAIStore((s) => s.switchConversation)
  const deleteConversation = useAIStore((s) => s.deleteConversation)
  const renameConversation = useAIStore((s) => s.renameConversation)
  const compactConversation = useAIStore((s) => s.compactConversation)
  const isCompacting = useAIStore((s) => s.isCompacting)
  const activeModel = useAIStore((s) => s.activeModel)
  const models = useAIStore((s) => s.models)
  const messages = useAIStore((s) => s.messages)
  const stats = useAIStore((s) => s.sessionStats)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const active = conversations.find((c) => c.id === activeId)
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)

  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens
  const contextWindow = models.find((m) => m.id === activeModel)?.contextWindow ?? null
  const remaining = contextWindow != null ? Math.max(0, contextWindow - totalTokens) : null
  const pct = contextWindow && contextWindow > 0
    ? Math.min(100, Math.round((totalTokens / contextWindow) * 100))
    : 0
  const contextTone = pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'accent'
  const remainingTone = pct >= 90 ? 'text-error' : pct >= 70 ? 'text-warning' : 'text-text-secondary'

  const canCompact = messages.length >= 6 && !isCompacting

  const commitEdit = () => {
    if (editingId) renameConversation(editingId, draft)
    setEditingId(null)
  }

  // "Rename" opens the history menu with the active row already in edit
  // mode — driving History's `open` here (rather than letting it own its
  // own state) is what makes that cross-menu handoff possible.
  const moreMenuItems: MenuNode[] = active
    ? [
        {
          kind: 'item',
          id: 'rename',
          label: t('aiui.header.renameAction'),
          icon: <Pencil size={12} />,
          onSelect: () => { setEditingId(active.id); setDraft(active.title); setHistoryOpen(true) },
        },
        {
          kind: 'item',
          id: 'compact',
          label: t('aiui.header.compactAction'),
          icon: <Minimize2 size={12} />,
          onSelect: () => { void compactConversation() },
          disabled: !canCompact,
        },
        {
          kind: 'item',
          id: 'delete',
          label: t('aiui.header.deleteAction'),
          icon: <Trash2 size={12} />,
          onSelect: () => { void deleteConversation(active.id) },
          tone: 'danger',
        },
      ]
    : []

  return (
    <Box className="border-b border-border-default bg-bg-secondary">
      {/* Row 1: title + actions */}
      <Flex align="center" gap="xs" className="px-3 pt-2 pb-1.5">
        <DropdownMenu
          aria-label={t('aiui.header.conversationHistory')}
          className="w-72"
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          trigger={
            <Button
              variant="bare"
              size="none"
              type="button"
              className="flex items-center gap-1.5 flex-1 min-w-0 text-left rounded-md px-1.5 py-1 hover:bg-hover transition-colors"
              aria-label={t('aiui.header.conversationHistory')}
            >
              <History size={13} className="text-text-tertiary shrink-0" />
              <Text size="sm" weight="medium" truncate className="flex-1">
                {active?.title ?? t('aiui.header.newChatTitle')}
              </Text>
              <ChevronDown size={12} className="text-text-tertiary shrink-0" />
            </Button>
          }
        >
          {sorted.map((c) => (
              <Menu.RadioItem
                key={c.id}
                label={c.title}
                checked={c.id === activeId}
                onSelect={() => { if (editingId !== c.id) void switchConversation(c.id) }}
              >
                {editingId === c.id ? (
                  <Flex
                    align="center"
                    gap="xs"
                    className="flex-1 min-w-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      size="xs"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="flex-1"
                    />
                    <IconButton
                      label={t('aiui.header.saveName')}
                      size="xs"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); commitEdit() }}
                    >
                      <Check size={12} />
                    </IconButton>
                    <IconButton
                      label={t('aiui.header.cancelRename')}
                      size="xs"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); setEditingId(null) }}
                    >
                      <X size={12} />
                    </IconButton>
                  </Flex>
                ) : (
                  <Flex align="center" gap="xs" className="group flex-1 min-w-0">
                    <Text size="xs" truncate className="flex-1">{c.title}</Text>
                    <Box
                      className="hidden group-hover:flex items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconButton
                        label={t('aiui.header.rename')}
                        size="xs"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setDraft(c.title) }}
                      >
                        <Pencil size={11} />
                      </IconButton>
                      <IconButton
                        label={t('aiui.header.delete')}
                        size="xs"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); void deleteConversation(c.id) }}
                      >
                        <Trash2 size={11} />
                      </IconButton>
                    </Box>
                  </Flex>
                )}
              </Menu.RadioItem>
          ))}
        </DropdownMenu>
        <Tooltip content={t('aiui.header.newChat')} side="bottom">
          <IconButton label={t('aiui.header.newChat')} size="xs" variant="ghost" onClick={() => newConversation()}>
            <Plus size={14} />
          </IconButton>
        </Tooltip>
        <Tooltip
          content={canCompact ? t('aiui.header.compactHint') : t('aiui.header.compactDisabledHint')}
          side="bottom"
        >
          <IconButton
            label={t('aiui.header.compact')}
            size="xs"
            variant="ghost"
            disabled={!canCompact}
            onClick={() => { void compactConversation() }}
          >
            {isCompacting ? <Spinner size="xs" className="text-current" /> : <Minimize2 size={13} />}
          </IconButton>
        </Tooltip>
        <DropdownMenu
          aria-label={t('aiui.header.more')}
          className="w-48"
          items={moreMenuItems}
          trigger={
            <IconButton label={t('aiui.header.more')} size="xs" variant="ghost">
              <MoreHorizontal size={14} />
            </IconButton>
          }
        />
      </Flex>

      {/* Row 2: model + context window bar (prominent) */}
      <Box className="px-3 pb-2 space-y-1">
        <Flex align="center" justify="between" className="text-[11px]">
          <Flex align="center" gap="xs">
            <Sparkles size={11} className="text-accent" />
            <Text size="xs" color="muted">{t('aiui.header.model')}</Text>
          </Flex>
          <Text size="xs" weight="medium" className="truncate max-w-[180px]">
            {models.find((m) => m.id === activeModel)?.name ?? activeModel ?? t('aiui.header.noModel')}
          </Text>
        </Flex>

        {contextWindow != null ? (
          <>
            <Progress
              value={pct}
              tone={contextTone}
              className="bg-bg-tertiary shadow-none"
              aria-label={t('aiui.header.used', { used: formatCompactNumber(totalTokens), total: formatCompactNumber(contextWindow) })}
            />
            <Flex align="center" justify="between" className="text-[10px]">
              <Text size="xs" color="muted">
                {t('aiui.header.used', { used: formatCompactNumber(totalTokens), total: formatCompactNumber(contextWindow) })}
              </Text>
              <Text size="xs" weight="medium" className={remainingTone}>
                {t('aiui.header.remaining', { remaining: formatCompactNumber(remaining ?? 0) })}
              </Text>
            </Flex>
          </>
        ) : (
          <Text size="xs" color="muted">{t('aiui.header.noContextWindow')}</Text>
        )}
      </Box>
    </Box>
  )
}
