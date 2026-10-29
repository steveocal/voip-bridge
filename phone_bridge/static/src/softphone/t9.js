/** Contact matching for the keypad, as in the VoIP Bridge dashboard: typed
 *  digits match names on T9 (word starts, across words, or initials) and
 *  anywhere in a number (+44 numbers also as 0…); typed letters match names.
 *  Each hit carries the name and number split into highlighted parts. */

const T9_KEYS = { a: 2, b: 2, c: 2, d: 3, e: 3, f: 3, g: 4, h: 4, i: 4, j: 5, k: 5, l: 5, m: 6, n: 6, o: 6, p: 7, q: 7, r: 7, s: 7, t: 8, u: 8, v: 8, w: 9, x: 9, y: 9, z: 9 };

function t9Char(ch) {
    ch = ch.toLowerCase();
    if (ch >= "0" && ch <= "9") return ch;
    const d = T9_KEYS[ch.normalize("NFD").charAt(0)];
    return d ? String(d) : "";
}

export function digitsOnly(s) {
    return String(s || "").replace(/[^0-9]/g, "");
}

// Name -> words with their T9 digits and where each starts in the name.
function t9Words(name) {
    const words = [];
    let cur = null;
    for (let i = 0; i < name.length; i++) {
        const d = t9Char(name.charAt(i));
        if (!d) { cur = null; continue; }
        if (!cur) { cur = { at: i, t9: "", txt: "" }; words.push(cur); }
        cur.t9 += d;
        cur.txt += name.charAt(i).toLowerCase();
    }
    return words;
}

export function t9Entry(name, num, partner) {
    name = String(name || "").trim();
    const digits = digitsOnly(num);
    const nums = digits ? [digits] : [];
    if (digits.startsWith("44")) nums.push("0" + digits.slice(2));
    return { name, num: String(num || ""), digits, nums, words: t9Words(name), partner };
}

// Best match of q against one entry: { score, hl: [start,len] ranges in name, numHl }.
function t9Match(e, q, letters) {
    let best = null;
    const w = e.words;
    const take = (score, hl, numHl) => {
        if (!best || score > best.score) best = { score, hl: hl || [], numHl: numHl || null };
    };
    for (let i = 0; i < w.length; i++) {
        // q runs from the start of word i, possibly across the following words.
        let rest = q;
        const hl = [];
        for (let k = i; k < w.length && rest; k++) {
            const part = letters ? w[k].txt : w[k].t9;
            const n = Math.min(part.length, rest.length);
            if (part.slice(0, n) !== rest.slice(0, n)) break;
            hl.push([w[k].at, n]);
            rest = rest.slice(n);
            if (n < part.length) break;
        }
        if (!rest) take((i === 0 ? 60 : 50) + Math.min(q.length, 20), hl);
    }
    if (!letters && q.length >= 2 && w.length >= q.length) {
        for (let s = 0; s + q.length <= w.length; s++) {
            const ih = [];
            let ok = true;
            for (let m = 0; m < q.length; m++) {
                if (w[s + m].t9.charAt(0) !== q.charAt(m)) { ok = false; break; }
                ih.push([w[s + m].at, 1]);
            }
            if (ok) { take(40 + q.length, ih); break; }
        }
    }
    if (letters) {
        const at = e.name.toLowerCase().indexOf(q);
        if (at >= 0) take(30, [[at, q.length]]);
    } else {
        for (let j = 0; j < e.nums.length; j++) {
            const pos = e.nums[j].indexOf(q);
            if (pos < 0) continue;
            // Highlight on the stored number's own digits (the 0 form maps back to 44).
            const dpos = j === 0 ? pos : pos === 0 ? 0 : pos + 1;
            const dlen = j === 0 || pos > 0 ? q.length : q.length + 1;
            take((pos === 0 ? 35 : 20) + Math.min(q.length, 20), null, [dpos, dlen]);
        }
    }
    return best;
}

// Text -> [{t, on}] runs, marking the chars `isOn(i, ch)` picks.
function runs(text, isOn) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
        const on = isOn(i, text.charAt(i));
        if (out.length && out.at(-1).on === on) out.at(-1).t += text.charAt(i);
        else out.push({ t: text.charAt(i), on });
    }
    return out;
}

function nameParts(name, ranges) {
    const marks = {};
    for (const [at, len] of ranges) {
        let left = len;
        for (let i = at; i < name.length && left > 0; i++) {
            if (t9Char(name.charAt(i))) { marks[i] = true; left--; }
        }
    }
    return runs(name, (i) => !!marks[i]);
}

function numParts(num, range) {
    let di = -1;
    return runs(num, (i, ch) => {
        const digit = ch >= "0" && ch <= "9";
        if (digit) di++;
        return !!range && digit && di >= range[0] && di < range[0] + range[1];
    });
}

/** Up to `limit` entries matching what's typed, best first; earlier entries
 *  win ties (put recent callers before the contact book). One entry per
 *  number; a named one replaces a nameless one. */
export function t9Search(entries, raw, limit = 8) {
    raw = String(raw || "").trim();
    const letters = /[a-zA-Z]/.test(raw);
    const q = letters ? raw.toLowerCase() : digitsOnly(raw);
    if (!q) return [];
    const pool = [];
    const byNum = {};
    for (const e of entries) {
        if (!e.digits) continue;
        const at = byNum[e.digits];
        if (at === undefined) { byNum[e.digits] = pool.length; pool.push(e); }
        else if (!pool[at].name && e.name) pool[at] = e;
    }
    const hits = [];
    pool.forEach((e, order) => {
        const m = t9Match(e, q, letters);
        if (m) hits.push({ e, m, order });
    });
    hits.sort((a, b) => b.m.score - a.m.score || a.order - b.order);
    return hits.slice(0, limit).map(({ e, m }) => ({
        key: e.digits,
        name: e.name,
        num: e.num,
        partner: e.partner,
        nameParts: e.name ? nameParts(e.name, m.hl) : [],
        numParts: numParts(e.num, m.numHl),
    }));
}
