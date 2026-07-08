interface Block {
  type: "ul" | "ol" | "p";
  items: string[];
}

function parseNotes(text: string): Block[] {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const blocks: Block[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const isBullet = /^[•-]\s+/.test(line);
    const isNumbered = /^\d+\.\s+/.test(line);
    const content = isBullet ? line.replace(/^[•-]\s+/, "") : isNumbered ? line.replace(/^\d+\.\s+/, "") : line;
    const type: Block["type"] = isBullet ? "ul" : isNumbered ? "ol" : "p";
    const last = blocks[blocks.length - 1];
    if (last && last.type === type) last.items.push(content);
    else blocks.push({ type, items: [content] });
  }
  return blocks;
}

export function FormattedNotes({ text, className = "" }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  const blocks = parseNotes(text);
  return (
    <div className={`space-y-1 ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === "ul") {
          return (
            <ul key={i} className="list-disc pl-4 space-y-0.5">
              {b.items.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={i} className="list-decimal pl-4 space-y-0.5">
              {b.items.map((item, j) => <li key={j}>{item}</li>)}
            </ol>
          );
        }
        return b.items.map((item, j) => <p key={`${i}-${j}`}>{item}</p>);
      })}
    </div>
  );
}
