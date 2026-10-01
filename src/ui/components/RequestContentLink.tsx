import { CONTENT_REQUEST_EMAIL } from '../../app/config';

/** A plain mailto: link — no form, no backend. Opens the person's own email app with a prefilled message. */
export function buildRequestMailto(prefill?: string): string {
  const subject = 'Memorize: text request';
  const lines = [
    prefill ? `I was looking for: ${prefill}` : 'I was looking for:',
    '',
    "Where I'd point you to a reliable recording or source, if I have one:",
    '',
  ];
  const params = new URLSearchParams({ subject, body: lines.join('\n') });
  // URLSearchParams encodes spaces as '+', which mail clients don't reliably decode back in a mailto: body.
  return `mailto:${CONTENT_REQUEST_EMAIL}?${params.toString().replace(/\+/g, '%20')}`;
}

/** "Request a text" — opens an email addressed to whoever maintains this app's content. */
export function RequestContentLink({ prefill, className = 'btn sm' }: { prefill?: string; className?: string }) {
  return (
    <a className={className} href={buildRequestMailto(prefill)}>
      Request a text
    </a>
  );
}
