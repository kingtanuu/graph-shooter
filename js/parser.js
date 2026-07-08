/* グラフシューター — 数式パーサ（eval不使用）
 * 対応: + - * / ^ ( )、暗黙の乗算(2x, 3sin(x))、
 * 関数 sin cos tan abs sqrt log exp、定数 pi π e、変数 x
 */
(function () {
  'use strict';

  const FUNC_NAMES = ['sqrt', 'sin', 'cos', 'tan', 'abs', 'log', 'exp'];
  const FUNCS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    abs: Math.abs,
    sqrt: Math.sqrt,
    log: Math.log,
    exp: Math.exp,
    neg: (v) => -v,
  };
  const CONSTS = { pi: Math.PI, 'π': Math.PI, e: Math.E };
  const BIN_OPS = {
    '+': { prec: 2, right: false, fn: (a, b) => a + b },
    '-': { prec: 2, right: false, fn: (a, b) => a - b },
    '*': { prec: 3, right: false, fn: (a, b) => a * b },
    '/': { prec: 3, right: false, fn: (a, b) => a / b },
    '^': { prec: 4, right: true, fn: (a, b) => Math.pow(a, b) },
  };
  const NEG_PREC = 3.5;

  function err(msg) {
    const e = new Error(msg);
    e.isParseError = true;
    throw e;
  }

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '　') { i++; continue; }
      if (/[0-9.]/.test(c)) {
        const m = src.slice(i).match(/^\d*\.?\d+/);
        if (!m) err('数の書き方がおかしいよ（' + c + '）');
        tokens.push({ t: 'num', v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if (c === '(') { tokens.push({ t: 'lparen' }); i++; continue; }
      if (c === ')') { tokens.push({ t: 'rparen' }); i++; continue; }
      if (BIN_OPS[c]) { tokens.push({ t: 'op', v: c }); i++; continue; }
      if (/[a-zA-Zπ]/.test(c)) {
        // 英字の並びを関数名・定数・変数に分解する（xsin(x) → x * sin(x)）
        const m = src.slice(i).match(/^[a-zA-Zπ]+/);
        let word = m[0];
        i += word.length;
        while (word.length > 0) {
          const fn = FUNC_NAMES.find((f) => word.startsWith(f));
          if (fn) { tokens.push({ t: 'func', v: fn }); word = word.slice(fn.length); continue; }
          if (word.startsWith('pi')) { tokens.push({ t: 'const', v: 'pi' }); word = word.slice(2); continue; }
          const ch = word[0];
          if (ch === 'x' || ch === 'X') { tokens.push({ t: 'var' }); word = word.slice(1); continue; }
          if (ch === 'y' || ch === 'Y') err('式には y ではなく x を使ってね');
          if (CONSTS[ch]) { tokens.push({ t: 'const', v: ch }); word = word.slice(1); continue; }
          err('「' + ch + '」は使えない文字だよ');
        }
        continue;
      }
      err('「' + c + '」は使えない文字だよ');
    }
    return tokens;
  }

  // 暗黙の乗算を補う: 2x, x(x+1), )( , 2sin(x), xπ など
  function insertImplicitMul(tokens) {
    const out = [];
    const leftOk = (t) => t && (t.t === 'num' || t.t === 'var' || t.t === 'const' || t.t === 'rparen');
    const rightOk = (t) => t && (t.t === 'num' || t.t === 'var' || t.t === 'const' || t.t === 'func' || t.t === 'lparen');
    for (const tok of tokens) {
      if (leftOk(out[out.length - 1]) && rightOk(tok)) out.push({ t: 'op', v: '*' });
      out.push(tok);
    }
    return out;
  }

  // 操車場アルゴリズムで逆ポーランド記法へ
  function toRpn(tokens) {
    const output = [];
    const stack = [];
    let prev = null;
    for (const tok of tokens) {
      if (tok.t === 'num' || tok.t === 'var' || tok.t === 'const') {
        output.push(tok);
      } else if (tok.t === 'func') {
        stack.push(tok);
      } else if (tok.t === 'op') {
        const isUnary = tok.v === '-' && (!prev || prev.t === 'op' || prev.t === 'lparen');
        const isUnaryPlus = tok.v === '+' && (!prev || prev.t === 'op' || prev.t === 'lparen');
        if (isUnaryPlus) { prev = tok; continue; }
        if (isUnary) {
          stack.push({ t: 'func', v: 'neg', prec: NEG_PREC });
        } else {
          const o1 = BIN_OPS[tok.v];
          while (stack.length) {
            const top = stack[stack.length - 1];
            const topPrec = top.t === 'func' ? (top.prec || 99) : (top.t === 'op' ? BIN_OPS[top.v].prec : -1);
            if (top.t === 'lparen') break;
            if (topPrec > o1.prec || (topPrec === o1.prec && !o1.right)) output.push(stack.pop());
            else break;
          }
          stack.push(tok);
        }
      } else if (tok.t === 'lparen') {
        stack.push(tok);
      } else if (tok.t === 'rparen') {
        let found = false;
        while (stack.length) {
          const top = stack.pop();
          if (top.t === 'lparen') { found = true; break; }
          output.push(top);
        }
        if (!found) err('カッコ「(」が足りないよ');
        if (stack.length && stack[stack.length - 1].t === 'func') output.push(stack.pop());
      }
      prev = tok;
    }
    while (stack.length) {
      const top = stack.pop();
      if (top.t === 'lparen') err('カッコ「)」が足りないよ');
      output.push(top);
    }
    return output;
  }

  function makeEvaluator(rpn) {
    return function evalAt(x) {
      const st = [];
      for (const tok of rpn) {
        if (tok.t === 'num') st.push(tok.v);
        else if (tok.t === 'var') st.push(x);
        else if (tok.t === 'const') st.push(CONSTS[tok.v]);
        else if (tok.t === 'func') {
          if (st.length < 1) err('式が途中で終わっているみたい');
          st.push(FUNCS[tok.v](st.pop()));
        } else if (tok.t === 'op') {
          if (st.length < 2) err('式が途中で終わっているみたい');
          const b = st.pop();
          const a = st.pop();
          st.push(BIN_OPS[tok.v].fn(a, b));
        }
      }
      if (st.length !== 1) err('式のかたちがおかしいよ');
      return st[0];
    };
  }

  /** 式文字列 → { evalAt(x), text }。不正な式は日本語メッセージ付きで throw */
  function compile(src) {
    let s = String(src || '').trim();
    s = s.replace(/^y\s*=\s*/i, '').replace(/^=\s*/, '');
    if (!s) err('式を入力してね（例: 0.5x + 1）');
    const rpn = toRpn(insertImplicitMul(tokenize(s)));
    if (rpn.length === 0) err('式を入力してね（例: 0.5x + 1）');
    const evalAt = makeEvaluator(rpn);
    evalAt(1.2345); // 構造エラーをここで検出（NaN/Infinity は許容）
    return { evalAt, text: s };
  }

  const GSParser = { compile };
  if (typeof module !== 'undefined' && module.exports) module.exports = GSParser;
  if (typeof globalThis !== 'undefined') globalThis.GSParser = GSParser;
})();
