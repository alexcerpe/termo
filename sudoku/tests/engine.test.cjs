// Executar a partir da raiz: node sudoku/tests/engine.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8'), context);
const { generate, countSolutions, TARGET_CLUES } = context.window.SudokuEngine;

function validSolution(board) {
  const groups = [];
  for (let row = 0; row < 9; row++)
    groups.push(Array.from({ length: 9 }, (_, col) => board[row * 9 + col]));
  for (let col = 0; col < 9; col++)
    groups.push(Array.from({ length: 9 }, (_, row) => board[row * 9 + col]));
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++)
    groups.push(Array.from({ length: 9 }, (_, i) =>
      board[(br * 3 + Math.floor(i / 3)) * 9 + bc * 3 + i % 3]));
  return groups.every(group =>
    group.length === 9 && group.every(n => Number.isInteger(n) && n >= 1 && n <= 9) &&
    new Set(group).size === 9);
}

for (const difficulty of Object.keys(TARGET_CLUES)) {
  for (let i = 0; i < 20; i++) {
    const seed = difficulty + ':' + i;
    const { puzzle, solution, clues } = generate(seed, difficulty);
    assert.equal(puzzle.length, 81);
    assert.equal(solution.length, 81);
    assert.ok(validSolution(solution), 'Solução inválida: ' + seed);
    assert.equal(puzzle.filter(Boolean).length, clues);
    assert.ok(clues >= TARGET_CLUES[difficulty]);
    assert.ok(puzzle.every((n, j) => n === 0 || n === solution[j]));
    assert.equal(countSolutions(puzzle, 2), 1, 'Puzzle sem solução única: ' + seed);
    assert.equal(generate(seed, difficulty).puzzle.join(','), puzzle.join(','),
      'Geração diária não determinística: ' + seed);
  }
  console.log('✓ ' + difficulty + ': 20 jogos válidos com solução única');
}
console.log('80 jogos aprovados.');