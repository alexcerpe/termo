/* Núcleo de Sudoku clássico 9×9. Sem dependências externas. */
(() => {
  'use strict';

  const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const TARGET_CLUES = Object.freeze({ easy: 44, medium: 38, hard: 32, expert: 28 });

  function hashSeed(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function rngFor(seed) {
    let value = hashSeed(seed);
    return () => {
      value = (value + 0x6D2B79F5) | 0;
      let z = Math.imul(value ^ value >>> 15, 1 | value);
      z ^= z + Math.imul(z ^ z >>> 7, 61 | z);
      return ((z ^ z >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(input, rng) {
    const array = input.slice();
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function solvedGrid(rng) {
    const groups = shuffle([0, 1, 2], rng);
    const stacks = shuffle([0, 1, 2], rng);
    const rows = groups.flatMap(group => shuffle([0, 1, 2], rng).map(i => group * 3 + i));
    const cols = stacks.flatMap(group => shuffle([0, 1, 2], rng).map(i => group * 3 + i));
    const digits = shuffle(DIGITS, rng);
    const transposed = rng() < 0.5;
    const pattern = (r, c) => (3 * (r % 3) + Math.floor(r / 3) + c) % 9;
    return Array.from({ length: 81 }, (_, i) => {
      const r = Math.floor(i / 9);
      const c = i % 9;
      return digits[transposed ? pattern(rows[c], cols[r]) : pattern(rows[r], cols[c])];
    });
  }

  function candidateMask(board, i) {
    const row = Math.floor(i / 9), col = i % 9;
    const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
    let used = 0;
    for (let j = 0; j < 9; j++) {
      used |= 1 << board[row * 9 + j];
      used |= 1 << board[j * 9 + col];
      used |= 1 << board[(br + Math.floor(j / 3)) * 9 + bc + j % 3];
    }
    return (~used) & 0x3FE; // bits 1–9
  }

  function countSolutions(input, max = 2) {
    const board = input.slice();
    let found = 0;

    function search() {
      if (found >= max) return;
      let bestIndex = -1, bestMask = 0, bestCount = 10;
      for (let i = 0; i < 81; i++) {
        if (board[i] !== 0) continue;
        const mask = candidateMask(board, i);
        let bits = mask, count = 0;
        while (bits) { bits &= bits - 1; count++; }
        if (count === 0) return;
        if (count < bestCount) {
          bestIndex = i;
          bestMask = mask;
          bestCount = count;
          if (count === 1) break;
        }
      }
      if (bestIndex === -1) { found++; return; }
      for (let number = 1; number <= 9 && found < max; number++) {
        if (!(bestMask & (1 << number))) continue;
        board[bestIndex] = number;
        search();
      }
      board[bestIndex] = 0;
    }

    search();
    return found;
  }

  function generate(seed, difficulty = 'medium') {
    const target = TARGET_CLUES[difficulty];
    if (!target) throw new Error('Dificuldade inválida');
    const rng = rngFor(seed);
    let best = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const solution = solvedGrid(rng);
      const puzzle = solution.slice();
      let clues = 81;
      for (const index of shuffle(Array.from({ length: 81 }, (_, i) => i), rng)) {
        if (clues <= target) break;
        const number = puzzle[index];
        puzzle[index] = 0;
        if (countSolutions(puzzle, 2) !== 1) {
          puzzle[index] = number;
        } else {
          clues--;
        }
      }
      if (!best || clues < best.clues) best = { puzzle, solution, clues };
      if (clues <= target) break;
    }

    return best; // sempre solução única; quantidade de pistas pode variar
  }

  window.SudokuEngine = Object.freeze({ generate, countSolutions, TARGET_CLUES });
})();