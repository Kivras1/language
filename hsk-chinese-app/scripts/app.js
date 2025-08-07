const state = {
  level: 'hsk3',
  words: [],
  index: 0,
  known: new Set(),
};

const els = {
  levelBtns: () => Array.from(document.querySelectorAll('.level-btn')),
  knownCount: document.getElementById('knownCount'),
  totalCount: document.getElementById('totalCount'),
  percentComplete: document.getElementById('percentComplete'),
  progressFill: document.getElementById('progressFill'),

  // flashcards
  cardHanzi: document.getElementById('cardHanzi'),
  cardPinyin: document.getElementById('cardPinyin'),
  cardMeaning: document.getElementById('cardMeaning'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  shuffleBtn: document.getElementById('shuffleBtn'),
  markKnownBtn: document.getElementById('markKnownBtn'),

  modeTabs: () => Array.from(document.querySelectorAll('.mode-tab')),
  modes: {
    flashcards: document.getElementById('flashcardsMode'),
    quiz: document.getElementById('quizMode'),
    typing: document.getElementById('typingMode'),
  },

  // quiz
  quizPrompt: document.getElementById('quizPrompt'),
  quizOptions: document.getElementById('quizOptions'),
  quizFeedback: document.getElementById('quizFeedback'),
  nextQuizBtn: document.getElementById('nextQuizBtn'),

  // typing
  typingHanzi: document.getElementById('typingHanzi'),
  typingInput: document.getElementById('typingInput'),
  checkTypingBtn: document.getElementById('checkTypingBtn'),
  typingFeedback: document.getElementById('typingFeedback'),
  nextTypingBtn: document.getElementById('nextTypingBtn'),

  resetProgressBtn: document.getElementById('resetProgressBtn'),
};

// ---------- Utils ----------
function loadProgress(level) {
  try {
    const raw = localStorage.getItem(`known-${level}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(arr);
  } catch (e) {
    return new Set();
  }
}

function saveProgress(level, set) {
  try {
    localStorage.setItem(`known-${level}`, JSON.stringify(Array.from(set)));
  } catch (e) {
    // ignore
  }
}

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function normalizePinyin(str) {
  if (!str) return '';
  // Lowercase and trim extra spaces
  let s = str.toLowerCase().trim();
  // Convert tone marks to numeric if present
  const toneMap = {
    'ā': ['a', '1'], 'á': ['a', '2'], 'ǎ': ['a', '3'], 'à': ['a', '4'],
    'ē': ['e', '1'], 'é': ['e', '2'], 'ě': ['e', '3'], 'è': ['e', '4'],
    'ī': ['i', '1'], 'í': ['i', '2'], 'ǐ': ['i', '3'], 'ì': ['i', '4'],
    'ō': ['o', '1'], 'ó': ['o', '2'], 'ǒ': ['o', '3'], 'ò': ['o', '4'],
    'ū': ['u', '1'], 'ú': ['u', '2'], 'ǔ': ['u', '3'], 'ù': ['u', '4'],
    'ǖ': ['v', '1'], 'ǘ': ['v', '2'], 'ǚ': ['v', '3'], 'ǜ': ['v', '4'], 'ü': ['v', '0'],
    'ń': ['n', '2'], 'ň': ['n', '3'], 'ǹ': ['n', '4']
  };
  let out = '';
  for (const ch of s) {
    if (toneMap[ch]) {
      out += toneMap[ch][0];
    } else if (ch === 'ü') {
      out += 'v';
    } else {
      out += ch;
    }
  }
  // collapse multiple spaces
  out = out.replace(/\s+/g, ' ');
  return out;
}

function toNumericPinyin(strWithTones) {
  // Convert diacritics to base + tone number per syllable at end
  const vowels = 'aeiouv';
  const diacritics = {
    'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4],
    'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
    'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4],
    'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
    'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4],
    'ǖ': ['v', 1], 'ǘ': ['v', 2], 'ǚ': ['v', 3], 'ǜ': ['v', 4]
  };
  const syllables = strWithTones.toLowerCase().split(/\s+/).filter(Boolean);
  const result = [];
  for (const syl of syllables) {
    let tone = 0;
    let out = '';
    for (const ch of syl) {
      if (diacritics[ch]) {
        out += diacritics[ch][0];
        tone = diacritics[ch][1];
      } else if (ch === 'ü') {
        out += 'v';
      } else if (/[a-z]/.test(ch)) {
        out += ch;
      }
    }
    if ([...out].some(c => vowels.includes(c))) {
      result.push(out + (tone ? String(tone) : ''));
    } else if (out) {
      result.push(out);
    }
  }
  return result.join(' ');
}

function equivalentPinyin(a, b) {
  // Compare by numeric form; accept both tone-marked and numeric or no tones
  const na = toNumericPinyin(a);
  const nb = toNumericPinyin(b);
  if (na === nb) return true;
  // also accept no-tone equality
  const stripTones = (s) => s.replace(/[1-4]/g, '');
  return stripTones(na) === stripTones(nb);
}

// ---------- Data loading ----------
async function loadLevel(levelKey) {
  const file = levelKey === 'hsk3' ? 'data/hsk3.json' : 'data/hsk4.json';
  const res = await fetch(file);
  const words = await res.json();
  return words;
}

// ---------- Rendering ----------
function updateProgress() {
  const total = state.words.length;
  const known = state.known.size;
  els.totalCount.textContent = String(total);
  els.knownCount.textContent = String(known);
  const pct = total ? Math.round((known / total) * 1000) / 10 : 0;
  els.percentComplete.textContent = `${pct}%`;
  els.progressFill.style.width = `${pct}%`;
}

function renderCard() {
  if (state.words.length === 0) {
    els.cardHanzi.textContent = '—';
    els.cardPinyin.textContent = '—';
    els.cardMeaning.textContent = '—';
    return;
  }
  state.index = clamp(state.index, 0, state.words.length - 1);
  const w = state.words[state.index];
  els.cardHanzi.textContent = w.hanzi || '—';
  els.cardPinyin.textContent = w.pinyin || '—';
  els.cardMeaning.textContent = w.english || '—';
  els.markKnownBtn.textContent = state.known.has(w.hanzi) ? 'Known ✓' : 'Mark known ✓';
}

function setActiveMode(mode) {
  Object.entries(els.modes).forEach(([key, el]) => {
    el.classList.toggle('active', key === mode);
  });
  els.modeTabs().forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
    btn.setAttribute('aria-selected', btn.dataset.mode === mode ? 'true' : 'false');
  });
}

// ---------- Flashcards Events ----------
function bindFlashcardEvents() {
  els.prevBtn.addEventListener('click', () => {
    state.index = (state.index - 1 + state.words.length) % state.words.length;
    renderCard();
  });
  els.nextBtn.addEventListener('click', () => {
    state.index = (state.index + 1) % state.words.length;
    renderCard();
  });
  els.shuffleBtn.addEventListener('click', () => {
    shuffleInPlace(state.words);
    state.index = 0;
    renderCard();
  });
  els.markKnownBtn.addEventListener('click', () => {
    const w = state.words[state.index];
    if (!w) return;
    if (state.known.has(w.hanzi)) {
      state.known.delete(w.hanzi);
    } else {
      state.known.add(w.hanzi);
    }
    saveProgress(state.level, state.known);
    updateProgress();
    renderCard();
  });
}

// ---------- Quiz (Multiple Choice) ----------
function pickRandomWords(n) {
  const arr = [...state.words];
  shuffleInPlace(arr);
  return arr.slice(0, Math.min(n, arr.length));
}

function newQuizRound() {
  const candidates = pickRandomWords(4);
  if (candidates.length < 2) {
    els.quizPrompt.textContent = '—';
    els.quizOptions.innerHTML = '';
    els.quizFeedback.textContent = '';
    return;
  }
  const answerIdx = Math.floor(Math.random() * candidates.length);
  const answer = candidates[answerIdx];
  els.quizPrompt.textContent = `${answer.pinyin} — ${answer.english}`;
  els.quizOptions.innerHTML = '';
  els.quizFeedback.textContent = '';

  candidates.forEach((c) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = c.hanzi;
    btn.addEventListener('click', () => {
      const correct = c.hanzi === answer.hanzi;
      btn.classList.add(correct ? 'correct' : 'incorrect');
      els.quizFeedback.textContent = correct ? 'Correct!' : `Answer: ${answer.hanzi}`;
      if (correct) {
        state.known.add(answer.hanzi);
        saveProgress(state.level, state.known);
        updateProgress();
      }
      // reveal others
      for (const b of els.quizOptions.querySelectorAll('button')) {
        b.disabled = true;
        if (b.textContent === answer.hanzi) b.classList.add('correct');
      }
    });
    els.quizOptions.appendChild(btn);
  });
}

// ---------- Typing (Pinyin) ----------
let typingAnswer = null;
function newTypingRound() {
  const candidates = pickRandomWords(1);
  if (!candidates.length) {
    els.typingHanzi.textContent = '—';
    els.typingFeedback.textContent = '';
    els.typingInput.value = '';
    return;
  }
  typingAnswer = candidates[0];
  els.typingHanzi.textContent = typingAnswer.hanzi;
  els.typingFeedback.textContent = '';
  els.typingInput.value = '';
  els.typingInput.focus();
}

function checkTyping() {
  if (!typingAnswer) return;
  const user = els.typingInput.value.trim();
  if (!user) return;
  const ok = equivalentPinyin(user, typingAnswer.pinyin);
  if (ok) {
    els.typingFeedback.textContent = 'Correct! ✓';
    state.known.add(typingAnswer.hanzi);
    saveProgress(state.level, state.known);
    updateProgress();
  } else {
    els.typingFeedback.textContent = `Answer: ${typingAnswer.pinyin}`;
  }
}

function bindTypingEvents() {
  els.checkTypingBtn.addEventListener('click', checkTyping);
  els.typingInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      checkTyping();
    }
  });
  els.nextTypingBtn.addEventListener('click', newTypingRound);
}

// ---------- Level + Tabs ----------
function bindHeaderEvents() {
  els.levelBtns().forEach((btn) => {
    btn.addEventListener('click', async () => {
      const chosen = btn.dataset.level;
      if (state.level === chosen) return;
      els.levelBtns().forEach(b => b.classList.toggle('active', b === btn));
      // Persist currently known set
      saveProgress(state.level, state.known);
      // Switch level
      state.level = chosen;
      state.known = loadProgress(state.level);
      state.index = 0;
      state.words = await loadLevel(state.level);
      renderCard();
      updateProgress();
      newQuizRound();
      newTypingRound();
    });
  });

  els.modeTabs().forEach((tab) => {
    tab.addEventListener('click', () => {
      setActiveMode(tab.dataset.mode);
      if (tab.dataset.mode === 'quiz') newQuizRound();
      if (tab.dataset.mode === 'typing') newTypingRound();
    });
  });

  els.resetProgressBtn.addEventListener('click', () => {
    if (!confirm('Reset known progress for this level?')) return;
    state.known.clear();
    saveProgress(state.level, state.known);
    updateProgress();
    renderCard();
  });
}

// ---------- Bootstrap ----------
(async function init() {
  // default level from local storage preference if exists
  const pref = localStorage.getItem('level-pref');
  if (pref === 'hsk4') {
    state.level = 'hsk4';
    const btn = document.querySelector('.level-btn[data-level="hsk4"]');
    if (btn) {
      document.querySelector('.level-btn[data-level="hsk3"]').classList.remove('active');
      btn.classList.add('active');
    }
  }

  // persist preference
  document.querySelectorAll('.level-btn').forEach(b => {
    b.addEventListener('click', () => {
      localStorage.setItem('level-pref', b.dataset.level);
    });
  });

  state.known = loadProgress(state.level);
  state.words = await loadLevel(state.level);

  bindHeaderEvents();
  bindFlashcardEvents();
  bindTypingEvents();

  renderCard();
  updateProgress();
  newQuizRound();
  newTypingRound();
})();