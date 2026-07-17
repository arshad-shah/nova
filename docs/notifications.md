# Notifications & the attention seam

How Verql tells the user that **their response is needed** — most importantly an
approval prompt (an AI write tool, an MCP query authorization) raised while the
window may be in the background — and how any plugin can raise a native desktop
notification.

The design follows Verql's **orchestrator + plugins** rule: the host owns a thin,
delivery-agnostic *seam*; a bundled plugin owns the *delivery policy*; producers
depend on neither.

- [The three layers at a glance](#the-three-layers-at-a-glance)
- [System context](#system-context)
- [Architecture & components](#architecture--components)
- [Use cases](#use-cases)
- [Domain model](#domain-model)
- [Class model](#class-model)
- [Sequence: AI write-tool approval](#sequence-ai-write-tool-approval)
- [Sequence: MCP query approval](#sequence-mcp-query-approval)
- [Sequence: a plugin raises its own notification](#sequence-a-plugin-raises-its-own-notification)
- [Boot & activation](#boot--activation)
- [Dispatcher decision flow](#dispatcher-decision-flow)
- [Attention-request lifecycle](#attention-request-lifecycle)
- [User journey](#user-journey)
- [Requirements](#requirements)
- [Subsystem map](#subsystem-map)
- [Roadmap](#roadmap)
- [Where the code lives](#where-the-code-lives)

## The three layers at a glance

| Layer | Owns | Lives in |
|-------|------|----------|
| **Attention seam** (host glue) | a delivery-agnostic relay: `request` / `resolve` / `subscribe`; provided as the `attention` service | `src/main/attention/attention-hub.ts` |
| **`os-notifications` plugin** (domain logic) | delivery policy (enable, only-when-unfocused, approvals), de-dupe, urgency; provides the `os-notifications` service | `src/main/plugins/bundled/os-notifications/` |
| **Producers** | announce *what* needs attention; never decide *how* it's shown | AI `conversation-manager.ts`, `mcp/server.ts` |

## System context

Who talks to the subsystem, and the one-way flow from "approval raised" to "user
alerted".

```mermaid
flowchart LR
    User(["User"])
    AIClient(["AI Assistant"])
    MCPClient(["External MCP Client"])
    PluginAuthor(["Plugin Author"])

    subgraph Verql["Verql Desktop App"]
        Attention["Attention Seam (host glue)"]
        OSPlugin["os-notifications plugin"]
        Producers["Approval Producers (AI / MCP)"]
    end

    OSCenter(["OS Notification Center"])

    User -->|"chats / runs queries"| AIClient
    AIClient -->|"calls write tools"| Producers
    MCPClient -->|"calls write tools"| Producers
    Producers -->|"request / resolve"| Attention
    Attention -->|"attention events"| OSPlugin
    OSPlugin -->|"present()"| OSCenter
    OSCenter -->|"click to focus"| User
    PluginAuthor -.->|"consume os-notifications"| OSPlugin
```

## Architecture & components

The pieces inside the main process, the two services that wire them, and the
existing in-app approval UI in the renderer (which is **unchanged** — the OS
notification is an additional, background-friendly nudge on top of it).

```mermaid
flowchart TB
    subgraph Main["Main process (Node)"]
        subgraph HostGlue["Host glue (orchestrator)"]
            Hub["AttentionHubImpl<br/>request / resolve / subscribe"]
            SvcReg["ServiceRegistry"]
        end
        subgraph Producers["Approval producers"]
            CM["AI ConversationManager"]
            MCP["MCP Server"]
        end
        subgraph Plugins["Bundled plugins"]
            subgraph OSP["os-notifications plugin"]
                Disp["NotificationDispatcher<br/>(policy, electron-free)"]
                Native["ElectronNativeNotifier"]
                PSettings["Plugin settings"]
            end
        end
    end

    subgraph Renderer["Renderer (React)"]
        ApprovalUI["ApprovalCard / MCPApprovalDialog"]
    end

    Electron["Electron Notification API"]

    CM -->|"request / resolve"| Hub
    MCP -->|"request / resolve"| Hub
    Hub -->|"provided as 'attention'"| SvcReg
    SvcReg -->|"consume 'attention'"| Disp
    Hub -->|"AttentionEvent"| Disp
    Disp -->|"provides 'os-notifications'"| SvcReg
    Disp --> Native
    PSettings --> Disp
    Native --> Electron
    CM -->|"ai:chat:event"| ApprovalUI
    MCP -->|"mcp:approval-request"| ApprovalUI
    ApprovalUI -->|"approval-response"| CM
    ApprovalUI -->|"approval-response"| MCP
```

## Use cases

```mermaid
flowchart LR
    user(("User"))
    ai(("AI Assistant"))
    mcp(("MCP Client"))
    author(("Plugin Author"))

    subgraph System["OS Notification Subsystem"]
        uc1(["Be alerted to a pending approval"])
        uc2(["Click notification to focus window"])
        uc3(["Toggle desktop notifications"])
        uc4(["Limit notifications to background"])
        uc5(["Raise an approval request"])
        uc6(["Auto-dismiss on response"])
        uc7(["Send a custom notification"])
    end

    user --- uc1
    user --- uc2
    user --- uc3
    user --- uc4
    ai --- uc5
    mcp --- uc5
    uc5 -.->|"include"| uc1
    uc1 -.->|"extend"| uc6
    author --- uc7
```

## Domain model

The data that flows through the seam and how it maps to a native notification.

```mermaid
erDiagram
    ATTENTION_REQUEST {
        string id PK
        string kind "approval-alert-info"
        string title
        string body
        string source
    }
    ATTENTION_EVENT {
        string type "requested-resolved"
        string id FK
    }
    OS_NOTIFICATION_REQUEST {
        string id PK
        string title
        string body
        string urgency "low-normal-critical"
        string category "approval-alert-completion-info"
    }
    NATIVE_NOTIFICATION {
        string handle PK
    }
    ATTENTION_REQUEST ||--o{ ATTENTION_EVENT : "emits"
    ATTENTION_REQUEST ||--o| OS_NOTIFICATION_REQUEST : "mapped to"
    OS_NOTIFICATION_REQUEST ||--o| NATIVE_NOTIFICATION : "presents"
```

## Class model

The interfaces and the one concrete implementation. Note the dependency
direction: the dispatcher depends on small injected ports (`NativeNotifier`,
`NotificationSettings`), which is what keeps the policy unit-testable without
Electron.

```mermaid
classDiagram
    class AttentionHub {
        <<interface>>
        +request(AttentionRequest) void
        +resolve(id) void
        +subscribe(listener) Disposable
    }
    class AttentionHubImpl {
        -listeners Set~AttentionListener~
        -pending Set~string~
        +request() void
        +resolve() void
        +subscribe() Disposable
    }
    class AttentionRequest {
        +string id
        +AttentionKind kind
        +string title
        +string body
        +string source
    }
    class OsNotificationService {
        <<interface>>
        +isAvailable() bool
        +notify(OsNotificationRequest) OsNotificationHandle
    }
    class NotificationDispatcher {
        <<interface>>
        +handleAttention(AttentionEvent) void
        +dispose() void
    }
    class NativeNotifier {
        <<interface>>
        +isSupported() bool
        +isAnyWindowFocused() bool
        +focusPrimaryWindow() void
        +present(opts) NativeNotificationHandle
    }
    class NotificationSettings {
        <<interface>>
        +enabled() bool
        +onlyWhenUnfocused() bool
        +notifyApprovals() bool
    }
    AttentionHub <|.. AttentionHubImpl
    AttentionHubImpl ..> AttentionRequest : emits
    OsNotificationService <|-- NotificationDispatcher
    NotificationDispatcher ..> NativeNotifier : uses
    NotificationDispatcher ..> NotificationSettings : reads
    NotificationDispatcher ..> AttentionHub : subscribes
```

## Sequence: AI write-tool approval

The end-to-end path when the model proposes a write query. The notification and
the in-app `ApprovalCard` are raised together; either the click (focus) or the
card answers the prompt, and resolving the attention dismisses the notification.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CM as AI ConversationManager
    participant PM as PermissionManager
    participant Hub as AttentionHub
    participant Disp as NotificationDispatcher
    participant OS as OS Notification
    participant UI as Renderer ApprovalCard

    Note over CM: model calls a write tool
    CM->>PM: needsApproval(tool, params)?
    PM-->>CM: true
    CM->>PM: createApprovalRequest() => requestId
    CM->>Hub: request(id, kind=approval, source=ai)
    Hub->>Disp: AttentionEvent requested
    Disp->>Disp: isAvailable? onlyWhenUnfocused?
    Disp->>OS: present(critical)
    CM->>UI: yield approval-request (ai:chat:event)
    CM->>PM: waitForApproval(requestId)
    User->>OS: click notification
    OS-->>User: window focused
    User->>UI: Run / Decline
    UI->>PM: approval-response(requestId, approved)
    PM-->>CM: approved
    CM->>Hub: resolve(requestId)
    Hub->>Disp: AttentionEvent resolved
    Disp->>OS: close()
    alt approved
        CM->>CM: execute tool
    else rejected
        CM->>CM: return rejection to model
    end
```

## Sequence: MCP query approval

The MCP client is often headless, so the desktop notification may be the only
nudge the user gets. The 5-minute timeout also resolves the attention so a stale
notification doesn't linger.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Client as External MCP Client
    participant Srv as MCP Server
    participant Hub as AttentionHub
    participant Disp as NotificationDispatcher
    participant OS as OS Notification
    participant UI as Renderer MCPApprovalDialog

    Client->>Srv: call write tool
    Srv->>Srv: needsApprovalForCall(tool, args)
    Srv->>Hub: request(id, kind=approval, source=mcp)
    Hub->>Disp: AttentionEvent requested
    Disp->>OS: present(critical)
    Srv->>UI: mcp:approval-request
    Srv->>Srv: await requestApproval (5 min timeout)
    User->>OS: click notification
    User->>UI: Approve / Reject
    UI->>Srv: mcp:approval-response(id, approved)
    Srv->>Hub: resolve(id)
    Hub->>Disp: AttentionEvent resolved
    Disp->>OS: close()
    alt approved
        Srv->>Client: tool result
    else rejected or timeout
        Srv->>Client: "Query rejected by user in Verql"
    end
```

## Sequence: a plugin raises its own notification

Any plugin can reach the user directly through the `os-notifications` service —
without touching Electron and without re-implementing the enable / focus policy.

```mermaid
sequenceDiagram
    autonumber
    participant P as Some Plugin
    participant SR as ServiceRegistry
    participant Disp as NotificationDispatcher
    participant Native as NativeNotifier
    participant OS as OS

    P->>SR: consume('os-notifications')
    SR-->>P: OsNotificationService
    P->>Disp: notify(title, body, category)
    Disp->>Disp: isAvailable() and not (onlyWhenUnfocused and focused)
    Disp->>Native: present(opts)
    Native->>OS: new Notification(...).show()
    OS-->>P: handle with close()
```

```ts
import type { OsNotificationService } from '../os-notifications'

const notifier = ctx.services.consume<OsNotificationService>('os-notifications')
notifier?.notify({
  title: 'Export finished',
  body: 'orders.csv is ready',
  category: 'completion',
  onClick: () => { /* runs in main; defaults to focusing the window */ },
})
```

## Boot & activation

Why ordering is forgiving: the host provides the `attention` service **before**
any plugin activates, and the plugin uses `onAvailable` (not a bare `consume`)
so it subscribes whether the hub is already present or arrives later.

```mermaid
sequenceDiagram
    autonumber
    participant Host as ipc-handlers (boot)
    participant SR as ServiceRegistry
    participant Boot as PluginBootCoordinator
    participant AIP as ai plugin
    participant OSP as os-notifications plugin

    Host->>SR: provide('attention', AttentionHubImpl)
    Host->>Boot: register bundledPlugins
    Boot->>AIP: activate(ctx)
    AIP->>SR: consume('attention')
    SR-->>AIP: AttentionHub
    Boot->>OSP: activate(ctx)
    OSP->>SR: provide('os-notifications', dispatcher)
    OSP->>SR: onAvailable('attention')
    SR-->>OSP: AttentionHub (already present)
    OSP->>OSP: hub.subscribe(handleAttention)
```

## Dispatcher decision flow

The whole policy that decides whether a request becomes a visible notification.
This is the unit-tested core (`dispatcher.ts`), free of Electron.

```mermaid
flowchart TD
    A["notify(request)"] --> B{"enabled && isSupported?"}
    B -- no --> Z["return NOOP handle"]
    B -- yes --> C{"onlyWhenUnfocused && a window focused?"}
    C -- yes --> Z
    C -- no --> D{"request.id already active?"}
    D -- yes --> E["close previous handle"]
    D -- no --> F["native.present(...)"]
    E --> F
    F --> G{"request.id set?"}
    G -- yes --> H["track in active map"]
    G -- no --> I["return handle"]
    H --> I
```

## Attention-request lifecycle

A single request, by `id`, from raised to dismissed. Re-requesting the same `id`
replaces the on-screen notification; resolving dismisses it.

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Requested : request(id)
    Requested --> Surfaced : dispatcher shows notification
    Requested --> Suppressed : disabled or window focused
    Surfaced --> Replaced : same id re-requested
    Replaced --> Surfaced
    Surfaced --> Resolved : resolve(id)
    Suppressed --> Resolved : resolve(id)
    Resolved --> [*]
    note right of Surfaced : OS notification visible
    note right of Resolved : notification dismissed
```

## User journey

```mermaid
journey
    title Approval while the user is away
    section AI raises a write action
      Model proposes a write action: 3: AI
      Attention requested: 3: Host
      OS notification shown: 5: User
    section User responds
      Sees desktop banner: 5: User
      Clicks to focus Verql: 4: User
      Reviews the action in ApprovalCard: 4: User
      Approves: 5: User
    section Resolution
      Attention resolved: 3: Host
      Notification dismissed: 5: User
      Action executes: 4: AI
```

## Requirements

```mermaid
requirementDiagram
    requirement bg_approval {
      id: R1
      text: Surface pending approvals when the window is unfocused
      risk: medium
      verifymethod: test
    }
    functionalRequirement decoupled {
      id: R2
      text: Producers must not depend on the delivery mechanism
      risk: low
      verifymethod: inspection
    }
    functionalRequirement extensible {
      id: R3
      text: Other plugins can raise desktop notifications
      risk: low
      verifymethod: test
    }
    element attention_seam {
      type: host_glue
    }
    element os_plugin {
      type: bundled_plugin
    }
    attention_seam - satisfies -> decoupled
    os_plugin - satisfies -> bg_approval
    os_plugin - satisfies -> extensible
    bg_approval - traces -> decoupled
```

## Subsystem map

```mermaid
mindmap
  root((OS Notifications))
    Host glue
      Attention seam
        request
        resolve
        subscribe
      Service registry
    Plugin
      Dispatcher
        policy
        dedupe
        urgency
      NativeNotifier
        Electron Notification
      Settings
        enabled
        onlyWhenUnfocused
        notifyApprovals
    Producers
      AI approvals
      MCP approvals
    Future consumers
      dock badge
      window flash
      phone push
```

## Roadmap

```mermaid
timeline
    title Notification subsystem - shipped and future
    section Shipped
      Attention seam : request : resolve : subscribe
      os-notifications plugin : dispatcher policy : os-notifications service
      Wired producers : AI write-tool approvals : MCP query approvals
    section Future
      More consumers : dock badge : window flash
      Richer surfaces : native action buttons (macOS) : phone push
```

## Where the code lives

| Concern | File |
|---------|------|
| Attention seam (host glue) | `src/main/attention/attention-hub.ts` |
| Plugin manifest + wiring | `src/main/plugins/bundled/os-notifications/index.ts` |
| Delivery policy (electron-free) | `src/main/plugins/bundled/os-notifications/dispatcher.ts` |
| Electron `Notification` adapter | `src/main/plugins/bundled/os-notifications/native-notifier.ts` |
| Host provides `attention`, wires MCP | `src/main/ipc-handlers.ts`, `src/main/ipc/mcp.ts` |
| Producer — AI write-tool approval | `src/main/plugins/bundled/ai/internal/conversation-manager.ts` |
| Producer — MCP query approval | `src/main/mcp/server.ts` |
| Tests | `tests/unit/attention-hub.test.ts`, `tests/unit/os-notifications.test.ts` |

See also: [plugins.md §13](./plugins.md#13-desktop-notifications--the-attention-seam)
for the consumer-facing API, and [architecture.md](./architecture.md#main-process)
for where the seam sits among the main-process subsystems.
