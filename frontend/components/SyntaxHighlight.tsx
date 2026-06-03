import type { ReactNode } from "react";

// Generic regex tokenizer — runs the regex against `code` and maps each match
// through `pick`, interleaving literal text between matches.
function tokenize(
  code: string,
  re: RegExp,
  pick: (m: RegExpExecArray, k: number) => ReactNode,
): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0, k = 0;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) parts.push(code.slice(last, m.index));
    parts.push(pick(m, k++));
    last = re.lastIndex;
  }
  if (last < code.length) parts.push(code.slice(last));
  return <>{parts}</>;
}

// ── Light-theme (white / slate-50 backgrounds) ────────────────────────────────
// Groups: 1=comment  2=mongoFn  3=mongoArg  4=keyStr  5=keyColon  6=valStr  7=bool  8=num  9=$op
const JSON_LIGHT_RE = /(\/\/[^\n]*)|(ObjectId|ISODate)\(("[^"]*")\)|("(?:[^"\\]|\\.)*")([ \t]*:)|("(?:[^"\\]|\\.)*")|(\btrue\b|\bfalse\b|\bnull\b)|([-]?\d+(?:\.\d+)?)(?=[\s,\]\}]|$)|(\$\w+)/gm;

export function JsonLight({ code }: { code: string }) {
  return <>{tokenize(code, JSON_LIGHT_RE, ([full, comment, fn, fnArg, keyStr, keyColon, valStr, bool, num, op], k) => {
    if (comment) return <span key={k} className="text-slate-400 italic">{comment}</span>;
    if (fn)      return <span key={k}><span className="text-violet-600 font-semibold">{fn}</span><span className="text-slate-400">(</span><span className="text-emerald-700">{fnArg}</span><span className="text-slate-400">)</span></span>;
    if (keyStr)  return <span key={k}><span className="text-slate-800 font-bold">{keyStr}</span><span className="text-slate-400">{keyColon}</span></span>;
    if (valStr)  return <span key={k} className="text-emerald-700">{valStr}</span>;
    if (bool)    return <span key={k} className="text-rose-600 font-semibold">{bool}</span>;
    if (num)     return <span key={k} className="text-amber-700">{num}</span>;
    if (op)      return <span key={k} className="text-violet-700 font-semibold">{op}</span>;
    return <span key={k} className="text-slate-600">{full}</span>;
  })}</>;
}

// Groups: 1=comment  2=string  3=num  4=keyword  5=type
const SQL_LIGHT_RE = /(--[^\n]*)|('[^']*')|([-]?\d+(?:\.\d+)?)|(\b(?:SELECT|FROM|WHERE|JOIN|ON|ORDER|BY|LIMIT|GROUP|CREATE|TABLE|INSERT|INTO|REFERENCES|PRIMARY|KEY|NOT|NULL|AND|OR|AS|LEFT|INNER|ALTER|ADD|COLUMN|DISTINCT|HAVING|SERIAL|UNNEST)\b)|(\b(?:VARCHAR|INTEGER|TIMESTAMP|BOOLEAN|TEXT|BIGINT|FLOAT|SERIAL)\b)/gim;

export function SqlLight({ code }: { code: string }) {
  return <>{tokenize(code, SQL_LIGHT_RE, ([full, comment, str, num, kw, type], k) => {
    if (comment) return <span key={k} className="text-slate-400 italic">{comment}</span>;
    if (str)     return <span key={k} className="text-emerald-700">{str}</span>;
    if (num)     return <span key={k} className="text-amber-700">{num}</span>;
    if (kw)      return <span key={k} className="text-blue-700 font-semibold">{kw}</span>;
    if (type)    return <span key={k} className="text-cyan-700">{type}</span>;
    return <span key={k} className="text-slate-700">{full}</span>;
  })}</>;
}
