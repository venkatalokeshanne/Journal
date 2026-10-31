import { Fragment, type ReactNode } from 'react';

/** Tiny, safe Markdown renderer for AI output: ## headings, - bullets, **bold**, *italic*, `code`. No HTML. */
function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<b key={`${key}b${i++}`}>{tok.slice(2, -2)}</b>);
    else if (tok.startsWith('`')) out.push(<code key={`${key}c${i++}`}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={`${key}i${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function Md({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`u${blocks.length}`}>{list.map((l, i) => <li key={i}>{inline(l, `l${blocks.length}-${i}`)}</li>)}</ul>);
    list = [];
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) { list.push(bullet[1]); return; }
    flush();
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) blocks.push(<h4 key={`h${idx}`}>{inline(h[1], `h${idx}`)}</h4>);
    else if (line.trim()) blocks.push(<p key={`p${idx}`}>{inline(line, `p${idx}`)}</p>);
  });
  flush();
  return <div className="md">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
