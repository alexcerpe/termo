const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const basedir = path.join(__dirname, '..');

const win = {
  addEventListener() {},
  setInterval() {},
  confirm() { return true; },
  prompt() {}
};
vm.runInNewContext(fs.readFileSync(path.join(basedir, 'engine.js'), 'utf8'), {
  window: win
});

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.dataset = {};
    this.children = [];
    this.handlers = {};
    this.attrs = {};
    this.value = '';
    this.textContent = '';
    this.checked = false;
    this.classes = new Set();
    this.classList = {
      add: (...values) => values.forEach(value => this.classes.add(value)),
      remove: (...values) => values.forEach(value => this.classes.delete(value)),
      contains: value => this.classes.has(value),
      toggle: (value, state = !this.classes.has(value)) =>
        state ? this.classes.add(value) : this.classes.delete(value)
    };
  }
  appendChild(element) {
    this.children.push(...(element.fragment ? element.children : [element]));
  }
  replaceChildren(...elements) { this.children = elements; }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(type, handler) { this.handlers[type] = handler; }
  fire(type, target = this) { this.handlers[type]?.({ target }); }
  closest(selector) {
    if (selector === '.cell') return this.dataset.index !== undefined ? this : null;
    if (selector === '[data-digit]') return this.dataset.digit ? this : null;
    return null;
  }
  querySelector(query) {
    if (query === 'small') return this.small ||= new Element('small');
    return null;
  }
  focus() {}
}
const ids = [
  'board', 'boardCover', 'digitPad', 'difficulty', 'freeMode', 'dailyMode',
  'newGame', 'pauseButton', 'resumeButton', 'autoNotesButton', 'shareButton',
  'resultShare', 'progressText', 'boardStatus', 'dailyLabel', 'mistakeValue',
  'hintValue', 'timeValue', 'bestValue', 'completedValue', 'averageValue',
  'streakValue', 'hintText', 'notesButton', 'notesState', 'showErrors',
  'undoButton', 'redoButton', 'eraseButton', 'hintButton', 'checkButton',
  'resultDescription', 'resultDetails', 'resultModal', 'resultNewGame',
  'resultClose', 'toast'
];
const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
elements.resultModal.classList.add('hidden');
elements.boardCover.classList.add('hidden');
const digits = Array.from({ length: 9 }, (_, i) => {
  const button = new Element('button');
  button.dataset.digit = String(i + 1);
  return button;
});
const document = {
  hidden: false,
  getElementById: id => {
    if (!elements[id]) throw new Error('Elemento ausente: ' + id);
    return elements[id];
  },
  createElement: tag => new Element(tag),
  createDocumentFragment: () => Object.assign(new Element(), { fragment: true }),
  querySelectorAll: selector => selector === '[data-digit]' ? digits : [],
  addEventListener() {}
};
const memory = new Map();
const localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value)
};
const fakeLocation = {
  origin: 'https://termo.alexcerpe.com.br', search: ''
};
let sharedText = '';
const fakeNavigator = {
  clipboard: { writeText: text => { sharedText = text; return Promise.resolve(); } }
};
vm.runInNewContext(fs.readFileSync(path.join(basedir, 'app.js'), 'utf8'), {
  window: win,
  document,
  localStorage,
  performance: { now: () => Date.now() },
  location: fakeLocation,
  navigator: fakeNavigator,
  URLSearchParams,
  Intl, Date, Math, console, setTimeout, clearTimeout
});

const gameKey = 'alex-sudoku:v1:free:medium';
const state = () => JSON.parse(memory.get(gameKey));
const choose = index => elements.board.fire('click', elements.board.children[index]);
const number = digit => elements.digitPad.fire('click', digits[digit - 1]);

assert.equal(elements.board.children.length, 81);
let game = state();
assert.equal(win.SudokuEngine.countSolutions(game.puzzle), 1);
const cell = game.puzzle.findIndex(value => value === 0);
const correct = game.solution[cell];

choose(cell);
elements.pauseButton.fire('click');
number(correct);
assert.equal(state().entries[cell], 0, 'Pausa deve bloquear edição');
assert.equal(elements.boardCover.classList.contains('hidden'), false);
elements.resumeButton.fire('click');
number(correct);
assert.equal(state().entries[cell], correct, 'Retomar deve permitir edição');
elements.undoButton.fire('click');
assert.equal(state().entries[cell], 0, 'Desfazer deve restaurar posição');
elements.redoButton.fire('click');
assert.equal(state().entries[cell], correct, 'Refazer deve reaplicar número');

elements.autoNotesButton.fire('click');
assert.ok(state().notes.some(note => note > 0), 'Candidatos automáticos devem existir');
elements.hintButton.fire('click');
assert.equal(state().hints, 0, 'Primeira dica não pode revelar número');
assert.match(elements.hintText.textContent, /Clique em Dica novamente/);
elements.hintButton.fire('click');
assert.equal(state().hints, 1, 'Segunda dica deve revelar número');
elements.shareButton.fire('click');
assert.match(sharedText, /termo\.alexcerpe\.com\.br\/sudoku/);

elements.dailyMode.fire('click');
assert.ok([...memory.keys()].some(key => key.includes(':daily:')));
assert.equal(elements.dailyMode.classList.contains('active'), true);
console.log('✓ interface: seleção, pausa, desfazer/refazer, notas, dicas e desafio diário');

// Volta para a partida livre, preenche todas as casas e verifica conclusão.
elements.freeMode.fire('click');
game = state();
for (let i = 0; i < 81; i++) {
  if (game.puzzle[i] || game.entries[i] === game.solution[i]) continue;
  choose(i);
  number(game.solution[i]);
}
assert.equal(state().completed, true);
assert.equal(elements.resultModal.classList.contains('hidden'), false);
assert.equal(JSON.parse(memory.get('alex-sudoku:v1:stats')).medium.completed, 1);
console.log('✓ vitória: reconhecimento da solução e persistência das estatísticas');
