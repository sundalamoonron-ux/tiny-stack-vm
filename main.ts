import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Opcode table, 5 digits an entry: byte, immediate bytes, pops, pushes.
// A byte not listed traps 5.
const S =
  '00000011010240103010040120502206023070331602117021180211902120021210212202123011240212502126021270112802129021300213202133021340214820049210502105120052000640116502080010810108200183010';
const T: Record<number, number[]> = {};
for (let i = 0; i < S.length; i += 5) T[+S.slice(i, i + 2)] = [+S[i + 2], +S[i + 3], +S[i + 4]];

function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; code: number } {
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, cp = 0, pc = 0, ip = 0, ol = 0, st = 0;
  const n = p.length;
  const end = (code: number) => ({ out: out.subarray(0, ol), code });
  for (;;) {
    if (st === 1000000) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc];
    const t = T[op];
    if (!t) return end(5);
    const im = t[0];
    if (pc + im >= n) return end(9);
    st++;
    if (sp < t[1]) return end(2);
    if (sp - t[1] + t[2] > 256) return end(3);
    const nx = pc + 1 + im;
    pc = nx;
    switch (op) {
      case 0:
        return end(0);
      case 1:
        D[sp++] = (p[nx - 1] << 24) >> 24;
        break;
      case 2:
        D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24);
        break;
      case 3:
        sp--;
        break;
      case 4:
        D[sp] = D[sp - 1];
        sp++;
        break;
      case 5: {
        const x = D[sp - 1];
        D[sp - 1] = D[sp - 2];
        D[sp - 2] = x;
        break;
      }
      case 6:
        D[sp] = D[sp - 2];
        sp++;
        break;
      case 7: {
        const x = D[sp - 3];
        D[sp - 3] = D[sp - 2];
        D[sp - 2] = D[sp - 1];
        D[sp - 1] = x;
        break;
      }
      case 23:
        D[sp - 1] = -D[sp - 1];
        break;
      case 27:
        D[sp - 1] = ~D[sp - 1];
        break;
      case 16:
      case 17:
      case 18:
      case 19:
      case 20:
      case 21:
      case 22:
      case 24:
      case 25:
      case 26:
      case 28:
      case 29:
      case 30:
      case 32:
      case 33:
      case 34: {
        const b = D[sp - 1];
        const a = D[sp - 2];
        let r = 0;
        if (op === 16) r = a + b;
        else if (op === 17) r = a - b;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) {
          if (b === 0) return end(4);
          r = a / b;
        } else if (op === 20) {
          if (b === 0) return end(4);
          r = a % b;
        } else if (op === 21) {
          if (b === 0) return end(4);
          r = (a >>> 0) / (b >>> 0);
        } else if (op === 22) {
          if (b === 0) return end(4);
          r = (a >>> 0) % (b >>> 0);
        } else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = a >>> (b & 31);
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else r = a >>> 0 < (b >>> 0) ? 1 : 0;
        sp -= 2;
        D[sp++] = r;
        break;
      }
      case 48:
      case 49:
      case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = op === 48;
        if (op !== 48) {
          const v = D[--sp];
          take = op === 49 ? v === 0 : v !== 0;
        }
        if (take) pc = nx + rel;
        break;
      }
      case 51:
        if (cp === 64) return end(7);
        C[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 52:
        if (cp === 0) return end(8);
        pc = C[--cp];
        break;
      case 64: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return end(6);
        D[sp - 1] = M[a];
        break;
      }
      case 65: {
        const a = D[sp - 1];
        const v = D[sp - 2];
        if (a < 0 || a > 255) return end(6);
        sp -= 2;
        M[a] = v;
        break;
      }
      case 80: {
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 81:
        if (ol + 1 > 65536) return end(11);
        out[ol++] = D[--sp] & 255;
        break;
      case 82:
        D[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      default:
        return end(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(readFileSync(join(I, id, 'program.bin')), readFileSync(join(I, id, 'input.bin')));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), r.code + '\n');
}
