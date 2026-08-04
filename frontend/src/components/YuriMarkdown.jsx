import { Fragment } from 'react';

function safeHref(value) {
  const href = String(value || '').trim();
  if (/^(https?:\/\/|mailto:)/i.test(href) || href.startsWith('/')) return href;
  return '';
}

function renderInline(text, keyPrefix) {
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\r\n]+\]\([^) \r\n]+\)|\*[^*\n]+\*)/g;
  const parts = String(text || '').split(pattern).filter((part) => part !== '');

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      if (!href) return <Fragment key={key}>{link[1]}</Fragment>;
      const external = /^https?:\/\//i.test(href);
      return (
        <a key={key} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer noopener' : undefined}>
          {link[1]}
        </a>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

function collectList(lines, start, ordered) {
  const items = [];
  let index = start;
  const matcher = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-•]\s+(.+)$/;
  while (index < lines.length) {
    const match = lines[index].match(matcher);
    if (!match) break;
    items.push(match[1]);
    index += 1;
  }
  return { items, nextIndex: index };
}

export default function YuriMarkdown({ children }) {
  const lines = String(children || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 2, 5);
      const Heading = `h${level}`;
      blocks.push(<Heading key={`heading-${index}`}>{renderInline(heading[2], `heading-${index}`)}</Heading>);
      index += 1;
      continue;
    }

    if (/^\s*[-•]\s+/.test(line)) {
      const list = collectList(lines, index, false);
      blocks.push(
        <ul key={`list-${index}`}>
          {list.items.map((item, itemIndex) => <li key={`item-${index}-${itemIndex}`}>{renderInline(item, `item-${index}-${itemIndex}`)}</li>)}
        </ul>
      );
      index = list.nextIndex;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const list = collectList(lines, index, true);
      blocks.push(
        <ol key={`ordered-${index}`}>
          {list.items.map((item, itemIndex) => <li key={`ordered-item-${index}-${itemIndex}`}>{renderInline(item, `ordered-item-${index}-${itemIndex}`)}</li>)}
        </ol>
      );
      index = list.nextIndex;
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote[1], `quote-${index}`)}</blockquote>);
      index += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,3})\s+/.test(lines[index])
      && !/^\s*[-•]\s+/.test(lines[index])
      && !/^\s*\d+\.\s+/.test(lines[index])
      && !/^>\s?/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}>
        {paragraphLines.map((paragraphLine, lineIndex) => (
          <Fragment key={`line-${index}-${lineIndex}`}>
            {lineIndex ? <br /> : null}
            {renderInline(paragraphLine, `paragraph-${index}-${lineIndex}`)}
          </Fragment>
        ))}
      </p>
    );
  }

  return <div className="yuri-markdown">{blocks}</div>;
}
