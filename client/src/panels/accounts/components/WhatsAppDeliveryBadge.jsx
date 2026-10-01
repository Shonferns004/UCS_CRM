// Renders a receipt's real WhatsApp delivery state.
//
// The point of this component is that it never says "Sent" for something we
// have not been told. Meta's POST /messages returns 200 with a wamid the moment
// it accepts a request and downloads the receipt PDF afterwards, so a UI that
// treats that 200 as "sent" will happily report success for a message that dies
// minutes later with error 131053. Five receipts went missing that way.
//
// So the vocabulary is deliberately narrow:
//   - no status at all          -> "Not sent". Never assume success from absence.
//   - accepted                  -> "Accepted". Meta took it; delivery unconfirmed.
//   - sent/delivered/read       -> the real state.
//   - failed                    -> "Failed", in red, with Meta's reason on hover.
//
// Anything unrecognised renders as "Unknown" rather than falling through to a
// green tick, because a new Meta status must be visibly unhandled, not
// silently rounded up to success.

const STATUS_VIEW = {
  accepted:  { label: 'Accepted',  bg: '#fef3c7', fg: '#92400e', hint: 'WhatsApp accepted the request. Delivery is not confirmed yet.' },
  sent:      { label: 'Sent',      bg: '#dbeafe', fg: '#1d4ed8', hint: 'Sent to the donor on WhatsApp.' },
  delivered: { label: 'Delivered', bg: '#d1fae5', fg: '#065f46', hint: 'Delivered to the donor on WhatsApp.' },
  read:      { label: 'Read',      bg: '#a7f3d0', fg: '#064e3b', hint: 'Read by the donor on WhatsApp.' },
  failed:    { label: 'Failed',    bg: '#fee2e2', fg: '#991b1b', hint: null },
};

export function WhatsAppDeliveryBadge({ receipt, compact = false }) {
  const status = String(receipt?.wa_status || '').trim().toLowerCase();
  const failure = receipt?.wa_failure_reason || null;

  if (!status) {
    const sentFlag = receipt?.sent;
    const label = sentFlag ? 'Sent (unconfirmed)' : 'Not sent';
    const hint = sentFlag
      ? 'Marked sent without a delivery confirmation. Sent before delivery tracking was recorded.'
      : 'No WhatsApp send has been recorded for this receipt.';
    return <Badge label={label} bg="#f3f4f6" fg="#4b5563" hint={hint} compact={compact} />;
  }

  const view = STATUS_VIEW[status];
  if (!view) {
    return <Badge label="Unknown" bg="#f3f4f6" fg="#4b5563" hint={`Unrecognised delivery status "${status}".`} compact={compact} />;
  }

  return (
    <Badge
      label={view.label}
      bg={view.bg}
      fg={view.fg}
      hint={status === 'failed' && failure ? failure : view.hint}
      compact={compact}
    />
  );
}

function Badge({ label, bg, fg, hint, compact }) {
  return (
    <span
      title={hint || undefined}
      style={{
        display: 'inline-block',
        padding: compact ? '1px 6px' : '2px 8px',
        borderRadius: 4,
        background: bg,
        color: fg,
        fontSize: compact ? 10 : 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: hint ? 'help' : 'default',
      }}
    >
      {label}
    </span>
  );
}

export default WhatsAppDeliveryBadge;