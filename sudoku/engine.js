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


  // Explicações lógicas: candidato único e único oculto em linha/coluna/bloco.
  // Uma casa errada é corrigida primeiro para não inferir candidatos inválidos.
  function explainNext(input, solution) {
    const board = input.slice();
    for (let i = 0; i < 81; i++) {
      if (board[i] && board[i] !== solution[i]) {
        return {
          index: i, number: solution[i], technique: 'Correção',
          explanation: 'O número desta casa está incorreto. Revise os números relacionados antes de prosseguir.'
        };
      }
    }

    const masks = board.map((value, i) => value ? 0 : candidateMask(board, i));
    for (let i = 0; i < 81; i++) {
      const mask = masks[i];
      if (mask && !(mask & (mask - 1))) {
        return {
          index: i, number: solution[i], technique: 'Candidato único',
          explanation: 'Nesta casa só resta um número possível. Os outros oito já aparecem na linha, coluna ou bloco 3×3.'
        };
      }
    }

    const units = [];
    for (let row = 0; row < 9; row++)
      units.push({ label: 'linha ' + (row + 1), positions: Array.from({ length: 9 }, (_, col) => row * 9 + col) });
    for (let col = 0; col < 9; col++)
      units.push({ label: 'coluna ' + (col + 1), positions: Array.from({ length: 9 }, (_, row) => row * 9 + col) });
    for (let box = 0; box < 9; box++) {
      const br = Math.floor(box / 3) * 3, bc = (box % 3) * 3;
      units.push({ label: 'bloco 3×3', positions: Array.from({ length: 9 }, (_, i) => (br + Math.floor(i / 3)) * 9 + bc + i % 3) });
    }
    for (const unit of units) {
      for (let number = 1; number <= 9; number++) {
        const positions = unit.positions.filter(i => masks[i] & (1 << number));
        if (positions.length === 1) {
          return {
            index: positions[0], number, technique: 'Único oculto',
            explanation: 'Na ' + unit.label + ', apenas esta casa pode receber o número ' + number + '.'
          };
        }
      }
    }

    const index = board.findIndex(value => value === 0);
    if (index < 0) return null;
    return {
      index, number: solution[index], technique: 'Revelação',
      explanation: 'Esta posição exige uma técnica mais avançada. Se quiser, revele o número e continue o desafio.'
    };
  }

  window.SudokuEngine = Object.freeze({ generate, countSolutions, candidateMask, explainNext, TARGET_CLUES });
})();