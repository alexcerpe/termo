/* Interface e progresso local do Sudoku clássico. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const Engine = window.SudokuEngine;
  const PREFIX = 'alex-sudoku:v1:';
  const STATS_KEY = PREFIX + 'stats';
  const SETTINGS_KEY = PREFIX + 'settings';
  const NAMES = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil', expert: 'Especialista' };
  const MAX_HISTORY = 80;
  const buttons = [];
  let game = null;
  let selected = 0;
  let notesMode = false;
  let showErrors = false;
  let clockAnchor = 0;
  let toastTimer = 0;
  let clockTicks = 0;

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { /* navegador pode estar bloqueando armazenamento */ }
  }

  function localDate() {
    const pieces = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = type => pieces.find(piece => piece.type === type).value;
    return get('year') + '-' + get('month') + '-' + get('day');
  }

  function slot(mode, difficulty, date = localDate()) {
    return PREFIX + (mode === 'daily' ? 'daily:' + date + ':' : 'free:') + difficulty;
  }

  function validSaved(value, mode, difficulty) {
    return value && value.mode === mode && value.difficulty === difficulty &&
      ['puzzle', 'solution', 'entries', 'notes'].every(key => Array.isArray(value[key]) && value[key].length === 81) &&
      Array.isArray(value.history) && Array.isArray(value.future) &&
      value.solution.every(n => Number.isInteger(n) && n >= 1 && n <= 9) &&
      value.puzzle.every((n, i) => Number.isInteger(n) && n >= 0 && n <= 9 && (!n || n === value.solution[i]));
  }

  function createGame(mode, difficulty, date = localDate()) {
    const seed = mode === 'daily'
      ? 'sudoku:daily:' + date + ':' + difficulty + ':v1'
      : 'sudoku:free:' + Date.now() + ':' + Math.random();
    const generated = Engine.generate(seed, difficulty);
    return {
      mode, difficulty, date: mode === 'daily' ? date : null, seed,
      puzzle: generated.puzzle, solution: generated.solution, clues: generated.clues,
      entries: Array(81).fill(0), notes: Array(81).fill(0),
      history: [], future: [],
      elapsedMs: 0, mistakes: 0, hints: 0, completed: false,
      startedAt: Date.now()
    };
  }

  function currentSlot() {
    return slot(game.mode, game.difficulty, game.date || localDate());
  }

  function elapsedMs() {
    if (!game) return 0;
    return game.elapsedMs + (clockAnchor ? performance.now() - clockAnchor : 0);
  }

  function stopClock() {
    if (clockAnchor && game) game.elapsedMs += performance.now() - clockAnchor;
    clockAnchor = 0;
  }

  function startClock() {
    if (game && !game.completed && !document.hidden) clockAnchor = performance.now();
  }

  function saveGame() {
    if (!game) return;
    const payload = { ...game, elapsedMs: elapsedMs() };
    write(currentSlot(), payload);
    write(SETTINGS_KEY, { mode: game.mode, difficulty: game.difficulty, notesMode, showErrors });
  }

  function switchGame(mode, difficulty, forceNew = false) {
    if (game) { stopClock(); saveGame(); }
    const key = slot(mode, difficulty);
    const saved = forceNew ? null : read(key);
    game = validSaved(saved, mode, difficulty) ? saved : createGame(mode, difficulty);
    selected = game.puzzle.findIndex((n, i) => !n && game.entries[i] === 0);
    if (selected < 0) selected = game.puzzle.findIndex(n => !n);
    if (selected < 0) selected = 0;
    clockTicks = 0;
    $('difficulty').value = difficulty;
    $('freeMode').classList.toggle('active', mode === 'free');
    $('dailyMode').classList.toggle('active', mode === 'daily');
    $('freeMode').setAttribute('aria-pressed', String(mode === 'free'));
    $('dailyMode').setAttribute('aria-pressed', String(mode === 'daily'));
    startClock();
    saveGame();
    render();
  }

  function timeLabel(milliseconds) {
    const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
    const minutes = Math.floor(seconds / 60);
    return String(minutes).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }

  const peers = Array.from({ length: 81 }, (_, index) => {
    const row = Math.floor(index / 9), col = index % 9;
    const groupRow = Math.floor(row / 3), groupCol = Math.floor(col / 3);
    return Array.from({ length: 81 }, (_, i) => i).filter(i => {
      if (i === index) return false;
      const r = Math.floor(i / 9), c = i % 9;
      return r === row || c === col ||
        (Math.floor(r / 3) === groupRow && Math.floor(c / 3) === groupCol);
    });
  });

  function valueAt(i) { return game.puzzle[i] || game.entries[i]; }

  function conflicting(i) {
    const value = valueAt(i);
    return Boolean(value && peers[i].some(j => valueAt(j) === value));
  }

  function buildBoard() {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9), c = i % 9;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.index = String(i);
      if (c === 2 || c === 5) cell.classList.add('box-right');
      if (r === 2 || r === 5) cell.classList.add('box-bottom');
      if (c === 8) cell.classList.add('last-col');
      if (r === 8) cell.classList.add('last-row');
      cell.tabIndex = -1;
      buttons.push(cell);
      fragment.appendChild(cell);
    }
    $('board').appendChild(fragment);
  }

  function render() {
    if (!game) return;
    const selectedValue = valueAt(selected);
    for (let i = 0; i < 81; i++) {
      const cell = buttons[i];
      const value = valueAt(i);
      const fixed = game.puzzle[i] !== 0;
      const invalid = conflicting(i) ||
        (showErrors && !fixed && value !== 0 && value !== game.solution[i]);
      cell.classList.toggle('fixed', fixed);
      cell.classList.toggle('peer', i !== selected && peers[selected].includes(i));
      cell.classList.toggle('same', i !== selected && Boolean(selectedValue) && selectedValue === value);
      cell.classList.toggle('selected', i === selected);
      cell.classList.toggle('invalid', invalid);
      cell.setAttribute('aria-selected', String(i === selected));
      cell.tabIndex = i === selected ? 0 : -1;

      const r = Math.floor(i / 9) + 1, c = i % 9 + 1;
      let label = 'Linha ' + r + ', coluna ' + c;
      if (value) {
        cell.textContent = String(value);
        label += ', ' + (fixed ? 'número fixo ' : 'número ') + value;
      } else if (game.notes[i] && !fixed) {
        const grid = document.createElement('span');
        grid.className = 'candidates';
        const numbers = [];
        for (let n = 1; n <= 9; n++) {
          const note = document.createElement('span');
          if (game.notes[i] & (1 << n)) { note.textContent = String(n); numbers.push(n); }
          grid.appendChild(note);
        }
        cell.replaceChildren(grid);
        label += ', anotações ' + numbers.join(', ');
      } else {
        cell.textContent = '';
        label += ', vazia';
      }
      cell.setAttribute('aria-label', label);
    }

    const filled = Array.from({ length: 81 }, (_, i) => valueAt(i)).filter(Boolean).length;
    $('progressText').textContent = filled + '/81 preenchidas';
    $('boardStatus').textContent = game.completed
      ? 'Concluído • ' + NAMES[game.difficulty]
      : (game.mode === 'daily' ? 'Desafio diário' : 'Jogo livre') + ' • ' + NAMES[game.difficulty];
    $('dailyLabel').classList.toggle('hidden', game.mode !== 'daily');
    if (game.mode === 'daily') {
      const [year, month, day] = game.date.split('-');
      $('dailyLabel').textContent = 'Desafio de ' + day + '/' + month + '/' + year + '. Mesmo tabuleiro para todos nesta dificuldade.';
    }
    $('mistakeValue').textContent = game.mistakes;
    $('hintValue').textContent = game.hints;
    $('timeValue').textContent = timeLabel(elapsedMs());

    const summary = (read(STATS_KEY) || {})[game.difficulty];
    $('bestValue').textContent = summary?.bestMs != null ? timeLabel(summary.bestMs) : '—';
    $('notesButton').classList.toggle('active', notesMode);
    $('notesButton').setAttribute('aria-pressed', String(notesMode));
    $('notesState').textContent = notesMode ? 'Ligadas' : 'Desligadas';
    $('showErrors').checked = showErrors;
    $('undoButton').disabled = game.completed || game.history.length === 0;
    $('redoButton').disabled = game.completed || game.future.length === 0;
    $('eraseButton').disabled = game.completed;
    $('hintButton').disabled = game.completed;
    $('checkButton').disabled = game.completed;
    $('notesButton').disabled = game.completed;

    const count = Array(10).fill(0);
    for (let i = 0; i < 81; i++) if (valueAt(i)) count[valueAt(i)]++;
    document.querySelectorAll('[data-digit]').forEach(button => {
      const n = Number(button.dataset.digit);
      button.querySelector('small').textContent = Math.max(0, 9 - count[n]) + ' rest.';
      button.classList.toggle('active', n === selectedValue);
      button.disabled = game.completed;
    });
  }

  function selectCell(index, focus = false) {
    if (index < 0 || index >= 81) return;
    selected = index;
    render();
    if (focus) buttons[index].focus({ preventScroll: true });
  }

  function snapshot() {
    return { entries: game.entries.slice(), notes: game.notes.slice() };
  }

  function applySnapshot(value) {
    game.entries = value.entries.slice();
    game.notes = value.notes.slice();
  }

  function edit(change) {
    if (game.completed) return;
    const previous = snapshot();
    change();
    if (previous.entries.every((v, i) => v === game.entries[i]) &&
        previous.notes.every((v, i) => v === game.notes[i])) return;
    game.history.push(previous);
    if (game.history.length > MAX_HISTORY) game.history.shift();
    game.future = [];
    saveGame();
    render();
    checkVictory();
  }

  function input(number) {
    if (!game || game.completed) return;
    if (game.puzzle[selected]) return toast('Este número faz parte do desafio e não pode ser alterado.');
    if (notesMode) {
      if (game.entries[selected]) return toast('Apague o número antes de escrever anotações.');
      edit(() => { game.notes[selected] ^= 1 << number; });
      return;
    }
    if (game.entries[selected] === number) return;
    edit(() => {
      game.entries[selected] = number;
      game.notes[selected] = 0;
      if (number !== game.solution[selected]) game.mistakes++;
      else for (const index of peers[selected]) game.notes[index] &= ~(1 << number);
    });
  }

  function erase() {
    if (!game || game.completed || game.puzzle[selected]) return;
    edit(() => { game.entries[selected] = 0; game.notes[selected] = 0; });
  }

  function undo() {
    if (!game || game.completed || !game.history.length) return;
    game.future.push(snapshot());
    applySnapshot(game.history.pop());
    saveGame();
    render();
  }

  function redo() {
    if (!game || game.completed || !game.future.length) return;
    game.history.push(snapshot());
    applySnapshot(game.future.pop());
    saveGame();
    render();
    checkVictory();
  }

  function hint() {
    if (!game || game.completed) return;
    let index = selected;
    if (game.puzzle[index] || game.entries[index] === game.solution[index]) {
      index = game.solution.findIndex((n, i) => !game.puzzle[i] && game.entries[i] !== n);
    }
    if (index < 0) return;
    selected = index;
    edit(() => {
      const number = game.solution[index];
      game.entries[index] = number;
      game.notes[index] = 0;
      for (const peer of peers[index]) game.notes[peer] &= ~(1 << number);
      game.hints++;
    });
  }

  function verify() {
    if (!game || game.completed) return;
    const incorrect = game.entries.filter((n, i) => n !== 0 && n !== game.solution[i]).length;
    if (incorrect) toast(incorrect + (incorrect === 1 ? ' número incorreto no tabuleiro.' : ' números incorretos no tabuleiro.'));
    else toast('Tudo certo até aqui. Continue!');
  }

  function finishStats() {
    const stats = read(STATS_KEY) || {};
    const record = stats[game.difficulty] || { completed: 0, bestMs: null };
    record.completed++;
    if (game.hints === 0 && (record.bestMs == null || game.elapsedMs < record.bestMs)) {
      record.bestMs = game.elapsedMs;
    }
    stats[game.difficulty] = record;
    write(STATS_KEY, stats);
  }

  function checkVictory() {
    if (!game || game.completed) return;
    const solved = game.solution.every((n, i) => valueAt(i) === n);
    if (!solved) return;
    stopClock();
    game.completed = true;
    finishStats();
    saveGame();
    render();
    $('resultDescription').textContent = 'Você resolveu um Sudoku ' +
      NAMES[game.difficulty].toLowerCase() + (game.mode === 'daily' ? ' do desafio diário.' : '.');
    $('resultDetails').textContent = timeLabel(game.elapsedMs) + ' • ' +
      game.mistakes + ' erro(s) • ' + game.hints + ' dica(s)';
    $('resultModal').classList.remove('hidden');
    $('resultNewGame').focus();
  }

  function closeModal() {
    $('resultModal').classList.add('hidden');
    buttons[selected].focus({ preventScroll: true });
  }

  function toast(message) {
    const element = $('toast');
    clearTimeout(toastTimer);
    element.textContent = message;
    element.classList.add('show');
    toastTimer = setTimeout(() => element.classList.remove('show'), 2400);
  }

  function newGame() {
    if (!game) return;
    const filled = game.entries.filter(Boolean).length;
    if ((!game.completed && filled > 0) || (game.mode === 'daily' && game.completed)) {
      const question = game.mode === 'daily'
        ? 'Reiniciar o desafio diário? Será o mesmo tabuleiro e você perderá o progresso.'
        : 'Começar outro Sudoku? O progresso desta partida será substituído.';
      if (!window.confirm(question)) return;
    }
    switchGame(game.mode, game.difficulty, true);
    if (game.mode === 'daily') toast('Desafio reiniciado. O tabuleiro diário não mudou.');
  }

  function moveSelection(key) {
    const row = Math.floor(selected / 9), col = selected % 9;
    const nr = Math.min(8, Math.max(0, row + (key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0)));
    const nc = Math.min(8, Math.max(0, col + (key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0)));
    selectCell(nr * 9 + nc, true);
  }

  function bindEvents() {
    $('board').addEventListener('click', event => {
      const cell = event.target.closest('.cell');
      if (cell) selectCell(Number(cell.dataset.index));
    });
    $('digitPad').addEventListener('click', event => {
      const button = event.target.closest('[data-digit]');
      if (button) input(Number(button.dataset.digit));
    });
    $('freeMode').addEventListener('click', () => switchGame('free', game.difficulty));
    $('dailyMode').addEventListener('click', () => switchGame('daily', game.difficulty));
    $('difficulty').addEventListener('change', event => switchGame(game.mode, event.target.value));
    $('newGame').addEventListener('click', newGame);
    $('notesButton').addEventListener('click', () => {
      notesMode = !notesMode;
      saveGame();
      render();
    });
    $('eraseButton').addEventListener('click', erase);
    $('undoButton').addEventListener('click', undo);
    $('redoButton').addEventListener('click', redo);
    $('hintButton').addEventListener('click', hint);
    $('checkButton').addEventListener('click', verify);
    $('showErrors').addEventListener('change', event => {
      showErrors = event.target.checked;
      saveGame();
      render();
    });
    $('resultNewGame').addEventListener('click', () => {
      closeModal();
      newGame();
    });
    $('resultClose').addEventListener('click', closeModal);
    $('resultModal').addEventListener('click', event => {
      if (event.target === $('resultModal')) closeModal();
    });

    document.addEventListener('keydown', event => {
      if (!game || event.target.closest('select, input, textarea')) return;
      if (!$('resultModal').classList.contains('hidden')) {
        if (event.key === 'Escape') closeModal();
        return;
      }
      const key = event.key;
      if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^[1-9]$/.test(key)) { event.preventDefault(); input(Number(key)); }
      else if (key.startsWith('Arrow')) { event.preventDefault(); moveSelection(key); }
      else if (key === 'Backspace' || key === 'Delete' || key === '0') {
        event.preventDefault(); erase();
      } else if (key.toLowerCase() === 'n') {
        event.preventDefault();
        if (!game.completed) { notesMode = !notesMode; saveGame(); render(); }
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { stopClock(); saveGame(); }
      else { startClock(); render(); }
    });
    window.addEventListener('pagehide', () => { stopClock(); saveGame(); });
    window.setInterval(() => {
      if (!game || game.completed) return;
      $('timeValue').textContent = timeLabel(elapsedMs());
      if (++clockTicks % 5 === 0) saveGame();
    }, 1000);
  }

  const preferences = read(SETTINGS_KEY) || {};
  const initialMode = preferences.mode === 'daily' ? 'daily' : 'free';
  const initialDifficulty = NAMES[preferences.difficulty] ? preferences.difficulty : 'medium';
  notesMode = Boolean(preferences.notesMode);
  showErrors = Boolean(preferences.showErrors);
  buildBoard();
  bindEvents();
  switchGame(initialMode, initialDifficulty);
})();