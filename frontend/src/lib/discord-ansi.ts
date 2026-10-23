const PALETTE = [
  "hsl(0 0% 0%)",
  "hsl(0.863 78.531% 65.294%)",
  "hsl(141.064 40.517% 45.49%)",
  "hsl(37.573 100% 40.392%)",
  "hsl(212.695 81.463% 59.804%)",
  "hsl(315.349 89.583% 62.353%)",
  "hsl(183.976 95.402% 34.118%)",
  "hsl(230 4.286% 72.549%)",
];

export interface AnsiSpan {
  text: string;
  color?: string;
  background?: string;
  bold?: boolean;
  underline?: boolean;
}

const SGR = new RegExp(`${String.fromCharCode(27)}\\[(\\d+(?:[:;]\\d+)*)m`, "g");

export function parseAnsi(code: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  let style: Omit<AnsiSpan, "text"> = {};
  let last = 0;

  for (const match of code.matchAll(SGR)) {
    if (match.index > last) spans.push({ ...style, text: code.slice(last, match.index) });
    last = match.index + match[0].length;
    // Discord's grammar compares raw parameters, so "01" isn't bold and `ESC[m` stays text.
    for (const part of match[1]!.split(";")) {
      if (part === "0") style = {};
      else if (part === "1") style = { ...style, bold: true };
      else if (part === "4") style = { ...style, underline: true };
      else if (/^3[0-7]$/.test(part)) style = { ...style, color: PALETTE[Number(part) - 30] };
      else if (/^4[0-7]$/.test(part)) style = { ...style, background: PALETTE[Number(part) - 40] };
      else if (part === "38" || part === "39") style = { ...style, color: undefined };
      else if (part === "48" || part === "49") style = { ...style, background: undefined };
    }
  }
  if (last < code.length) spans.push({ ...style, text: code.slice(last) });
  return spans;
}
