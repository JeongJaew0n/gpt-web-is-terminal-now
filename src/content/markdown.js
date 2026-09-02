// gpt-term — 마크다운 원문을 tty 노드로 그린다.
// HTML 문자열을 만들지 않는다. 전부 createElement 로 조립해 주입 위험을 없앤다.
// 지원 범위는 07 아트보드(출력 렌더링 규격)에 맞춘 부분집합이다.
GT.markdown = (function () {
  'use strict';

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // ------------------------------------------------------------------ inline

  const INLINE = [
    { re: /`([^`\n]+)`/, make: (m) => el('span', 'gt-code-inline', m[1]) },
    { re: /\*\*([^*\n]+)\*\*/, make: (m) => el('strong', 'gt-strong', m[1]) },
    { re: /(?<![*\w])\*([^*\n]+)\*(?!\w)/, make: (m) => el('em', 'gt-em', m[1]) },
    {
      re: /\[([^\]\n]+)\]\(([^)\s]+)\)/,
      make: (m) => {
        const a = el('a', 'gt-link', m[1]);
        a.href = /^https?:\/\//i.test(m[2]) ? m[2] : '#';
        a.target = '_blank';
        a.rel = 'noreferrer noopener';
        return a;
      }
    },
    {
      re: /(https?:\/\/[^\s<>()]+)/,
      make: (m) => {
        const a = el('a', 'gt-link', m[1]);
        a.href = m[1];
        a.target = '_blank';
        a.rel = 'noreferrer noopener';
        return a;
      }
    }
  ];

  function inline(text, frag) {
    frag = frag || document.createDocumentFragment();
    let rest = String(text);
    for (;;) {
      let best = null;
      for (const rule of INLINE) {
        const m = rule.re.exec(rest);
        if (m && (best === null || m.index < best.m.index)) best = { m, rule };
      }
      if (!best) break;
      if (best.m.index > 0) frag.appendChild(document.createTextNode(rest.slice(0, best.m.index)));
      frag.appendChild(best.rule.make(best.m));
      rest = rest.slice(best.m.index + best.m[0].length);
    }
    if (rest) frag.appendChild(document.createTextNode(rest));
    return frag;
  }

  // ------------------------------------------------------------------- block

  // 아이콘은 글리프 대신 그린다. 폰트에 없는 문자에 기대지 않는다 (tty 의 손잡이와 같은 규칙).
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICON = {
    copy: [
      'M5 4H2.8a1.3 1.3 0 0 0-1.3 1.3v6.4A1.3 1.3 0 0 0 2.8 13h4.9A1.3 1.3 0 0 0 9 11.7V9',
      'M6.3 1.5h4.9a1.3 1.3 0 0 1 1.3 1.3v4.9A1.3 1.3 0 0 1 11.2 9H6.3A1.3 1.3 0 0 1 5 7.7V2.8a1.3 1.3 0 0 1 1.3-1.3z'
    ],
    ok: ['M2.6 7.4 5.7 10.5 11.4 3.9'],
    fail: ['M3.6 3.6 10.4 10.4', 'M10.4 3.6 3.6 10.4']
  };

  function icon(kind) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 14 14');
    s.setAttribute('width', '13');
    s.setAttribute('height', '13');
    s.setAttribute('fill', 'none');
    s.setAttribute('aria-hidden', 'true');
    ICON[kind].forEach((d) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      s.appendChild(path);
    });
    return s;
  }

  // 복사 버튼. 누른 순간의 원문을 가져오도록 함수를 받는다 —
  // 스트리밍 중 노드를 재사용해도 옛 본문을 붙여넣지 않는다.
  // 글자가 없으므로 상태는 아이콘과 aria-label 로 알린다.
  function copyBtn(getText, label) {
    const name = label || '복사';
    const b = el('button', 'gt-copy');
    b.type = 'button';
    let cur = icon('copy');
    b.appendChild(cur);

    const show = (kind, text) => {
      const next = icon(kind);
      b.replaceChild(next, cur);
      cur = next;
      b.title = text;
      b.setAttribute('aria-label', text);
    };
    show('copy', name);

    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const done = (ok) => {
        b.dataset.state = ok ? 'ok' : 'fail';
        show(ok ? 'ok' : 'fail', ok ? '복사됨' : '복사 실패');
        setTimeout(() => {
          if (!b.isConnected) return;
          delete b.dataset.state;
          show('copy', name);
        }, 1200);
      };
      let p;
      try { p = GT.tty && GT.tty.copy ? GT.tty.copy(getText()) : false; } catch (_) { p = false; }
      Promise.resolve(p).then(done, () => done(false));
    });
    return b;
  }

  function codeBlock(lang, lines) {
    const box = el('div', 'gt-code');
    const head = el('div', 'gt-code-head');
    head.appendChild(el('span', 'gt-code-lang', lang || 'text'));
    head.appendChild(el('span', 'gt-spacer'));
    head.appendChild(el('span', 'gt-dim', `${lines.length} lines`));
    head.appendChild(copyBtn(() => box.dataset.code));
    box.appendChild(head);

    const body = el('div', 'gt-code-body');
    const gutter = el('div', 'gt-code-gutter');
    const code = el('pre', 'gt-code-text');
    lines.forEach((l, i) => {
      gutter.appendChild(el('span', null, String(i + 1)));
      code.appendChild(document.createTextNode(l + '\n'));
    });
    body.appendChild(gutter);
    body.appendChild(code);
    box.appendChild(body);

    box.dataset.code = lines.join('\n');
    return box;
  }

  function table(rows) {
    const t = el('table', 'gt-table');
    rows.forEach((cells, i) => {
      const tr = el('tr');
      cells.forEach((c) => {
        const td = el(i === 0 ? 'th' : 'td');
        td.appendChild(inline(c.trim()));
        tr.appendChild(td);
      });
      t.appendChild(tr);
    });
    return t;
  }

  function render(src) {
    const out = document.createDocumentFragment();
    const lines = String(src == null ? '' : src).split('\n');
    let i = 0;
    let para = [];

    const flushPara = () => {
      if (!para.length) return;
      const p = el('div', 'gt-p');
      p.appendChild(inline(para.join(' ')));
      out.appendChild(p);
      para = [];
    };

    while (i < lines.length) {
      const line = lines[i];

      const fence = /^\s*```+\s*([\w+-]*)\s*$/.exec(line);
      if (fence) {
        flushPara();
        const lang = fence[1];
        const body = [];
        i += 1;
        while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) { body.push(lines[i]); i += 1; }
        i += 1;
        out.appendChild(codeBlock(lang, body));
        continue;
      }

      if (/^\s*$/.test(line)) { flushPara(); i += 1; continue; }

      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        flushPara(); out.appendChild(el('div', 'gt-hr')); i += 1; continue;
      }

      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        flushPara();
        const n = el('div', `gt-h gt-h${h[1].length}`);
        n.appendChild(inline(h[2]));
        out.appendChild(n);
        i += 1; continue;
      }

      if (/^\s*>\s?/.test(line)) {
        flushPara();
        const buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
        const q = el('div', 'gt-quote');
        q.appendChild(el('span', 'gt-quote-bar'));
        const inner = el('div', 'gt-quote-body');
        inner.appendChild(render(buf.join('\n')));
        q.appendChild(inner);
        out.appendChild(q);
        continue;
      }

      if (/^\s*\|.*\|\s*$/.test(line)) {
        flushPara();
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|');
          if (!/^[\s:|-]+$/.test(lines[i])) rows.push(cells);
          i += 1;
        }
        if (rows.length) out.appendChild(table(rows));
        continue;
      }

      const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (li) {
        flushPara();
        const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2);
        const row = el('div', `gt-li gt-li-d${Math.min(depth, 3)}`);
        row.appendChild(el('span', 'gt-bullet', depth === 0 ? '·' : '▸'));
        const body = el('span', 'gt-li-body');
        body.appendChild(inline(li[3]));
        row.appendChild(body);
        out.appendChild(row);
        i += 1; continue;
      }

      para.push(line.trim());
      i += 1;
    }
    flushPara();
    return out;
  }

  return { render, inline, copyBtn };
})();
