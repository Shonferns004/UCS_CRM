# OpenWA + UCS CRM WhatsApp Dashboard Plan

## Goal

Each UCS CRM **Account** will contain a new page named **WhatsApp**. The page will be a native recreation of the OpenWA dashboard UI and features.

OpenWA remains a backend WhatsApp service. UCS CRM owns workers, contacts, assignments, broadcasts, and business data.

```text
UCS CRM Account → WhatsApp page (new native UI) → UCS CRM Backend → OpenWA WhatsApp API
```

## New WhatsApp dashboard page

Create one new WhatsApp dashboard page inside each UCS CRM Account. Recreate the OpenWA dashboard UI using UCS CRM components and routing. Do not embed OpenWA, use an iframe, or open a separate OpenWA dashboard.

The page should visually and functionally match the OpenWA dashboard, using the same layout style, sidebar navigation, cards, tables, forms, status indicators, and interaction patterns.

The recreated dashboard should include:

- Connection status, phone details, and QR-code pairing
- Start, stop, reconnect, and logout controls
- Chats and conversations
- Message thread and reply composer
- Contacts
- Broadcast messages
- Message history and delivery status
- Templates
- Webhook and event activity
- WhatsApp settings

The UCS CRM user should not need to open the separate OpenWA dashboard. All WhatsApp management happens inside the newly created native page.

## Setup

Copy OpenWA into the UCS CRM project without `node_modules`.

```powershell
npm.cmd ci
npm.cmd run start:dev
```

Keep OpenWA separate from the UCS CRM backend and use a different port:

```env
OPENWA_URL=http://localhost:3001
OPENWA_API_KEY=owa_k1_replace_me
```

The UCS CRM frontend must never receive the API key.

## UCS CRM database

The UCS CRM database is the source of truth. Add or map:

- `account_whatsapp_sessions`
- `contacts`
- `conversations`
- `conversation_assignments`
- `messages`
- `broadcasts`
- `broadcast_recipients`
- `webhook_events`

Every record must include the UCS CRM account ID for account isolation.

## Backend integration

Create an OpenWA client in the UCS CRM backend for session management, QR retrieval, status, single messages, bulk messages, batch progress, and cancellation.

Example:

```js
await fetch(`${process.env.OPENWA_URL}/api/sessions/${sessionId}/messages/send-text`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.OPENWA_API_KEY,
  },
  body: JSON.stringify({ chatId, text }),
});
```

## Worker assignment

Worker assignment belongs in the UCS CRM backend:

1. OpenWA sends an incoming-message webhook.
2. UCS CRM finds or creates the contact and conversation.
3. UCS CRM assigns the conversation to a worker.
4. UCS CRM stores the message and assignment.
5. UCS CRM notifies the assigned worker.

Assignment rules may be manual, round-robin, availability-based, department-based, or workload-based.

## Broadcast messages

The UCS CRM Account panel should support selecting a session, selecting/importing contacts, composing text/media, previewing recipients, setting a delay, starting/cancelling, and viewing sent/pending/failed results.

The CRM backend calls:

```text
POST /api/sessions/{sessionId}/messages/send-bulk
```

Store the returned batch ID and update UCS CRM broadcast records from batch status and webhook events.

## Webhooks

Configure OpenWA to call:

```text
POST https://your-crm.example.com/api/webhooks/openwa
```

Verify the secret, identify the CRM account, save the event, update messages, and notify the assigned worker.

## Implementation order

1. Add the OpenWA client to the CRM backend.
2. Map CRM accounts to OpenWA sessions.
3. Recreate the OpenWA dashboard shell and sidebar inside the WhatsApp page.
4. Build connection status and QR pairing.
5. Add chats, messages, contacts, and templates to the recreated dashboard.
6. Add incoming webhooks and worker assignment.
7. Add broadcast creation and progress tracking.
8. Add permissions, account isolation, retries, logging, and audit history.

## Production requirements

- Persist OpenWA `data/` so sessions survive restarts.
- Keep API keys and webhook secrets server-side.
- Use HTTPS between CRM and OpenWA.
- Restrict OpenWA access to the CRM backend.
- Add retries and idempotency.
- Rate-limit broadcasts and follow WhatsApp policies.
- Rotate the development API key before production.
