(function () {
  const data = window.LDS_GAME_DATA;
  const teamColors = ['#d62828', '#0077b6', '#2a9d8f', '#f77f00'];
  const teamNames = ['Red Team', 'Blue Team', 'Green Team', 'Orange Team'];
  const POINTS_PER_BADGE = 5;
  const WINNING_BADGES = 5;
  const TURN_PHASES = Object.freeze({
    WAITING_TO_ROLL: 'waitingToRoll',
    ROLLING_DICE: 'rollingDice',
    MOVING_PIECE: 'movingPiece',
    RESOLVING_LANDING: 'resolvingLanding',
    CHOOSING_DECK: 'choosingDeck',
    SHOWING_QUESTION: 'showingQuestion',
    SCORING_QUESTION: 'scoringQuestion',
    CHANGING_TURN: 'changingTurn',
    GAME_OVER: 'gameOver',
  });
  const APP_MODES = Object.freeze({
    BOARD: 'board',
    CARD_REVIEW_DECK_SELECT: 'cardReviewDeckSelect',
    CARD_REVIEW_ACTIVE: 'cardReviewActive',
    GAME_OVER: 'gameOver',
  });
  const reducedMotionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  const state = {
    teams: [],
    activeTeamIndex: 0,
    lastRoll: null,
    currentCard: null,
    currentCardOptions: null,
    currentQuestionKey: null,
    choiceContext: null,
    scoredQuestionKeys: new Set(),
    drawnCards: {},
    gamePhase: TURN_PHASES.WAITING_TO_ROLL,
    gameOver: false,
    hasScoredThisTurn: false,
    winningTeam: null,
    scoreFeedback: null,
    turnAnimationKey: 0,
    isMuted: true,
    reducedMotion: reducedMotionQuery.matches,
    appMode: APP_MODES.BOARD,
    reviewMode: {
      isActive: false,
      selectedDeckId: null,
      currentCardIndex: 0,
      cardOrder: [],
      isAnswerVisible: false,
      reviewedCards: new Set(),
      gotItCards: new Set(),
      needPracticeCards: new Set(),
      isCardTransitioning: false,
      isOverlayTransitioning: false,
      transitionPhase: null,
      previousCardIndex: null,
      nextCardIndex: null,
      previousCardOrder: [],
      previousAnswerVisible: false,
      transitionDirection: 'neutral',
    },
  };

  const boardEl = document.getElementById('board');
  const scoreboardEl = document.getElementById('scoreboard');
  const turnTitleEl = document.getElementById('turnTitle');
  const diceDisplayEl = document.getElementById('diceDisplay');
  const turnMetricsEl = document.getElementById('turnMetrics');
  const statusEl = document.getElementById('statusMessage');
  const cardPanelEl = document.getElementById('cardPanel');
  const rollButton = document.getElementById('rollButton');
  const resetButton = document.getElementById('resetButton');
  const muteToggle = document.getElementById('muteToggle');
  const motionToggle = document.getElementById('motionToggle');
  const teamForm = document.getElementById('teamForm');
  const teamCountSelect = document.getElementById('teamCount');
  const rulesDialog = document.getElementById('rulesDialog');
  const celebrationOverlayEl = document.getElementById('celebrationOverlay');
  const reviewModeEl = document.getElementById('reviewMode');
  const reviewEntryButtons = document.querySelectorAll('[data-open-review]');

  const deckLabels = {
    station: 'Station',
    variable: 'Variable',
    'data-cleaning': 'Data Cleaning',
    'exam-trap': 'Exam Trap',
    challenge: 'Challenge',
    cleaning: 'Data Cleaning',
    examTrap: 'Exam Trap',
    bonus: 'Choose Deck',
    weatherEvent: 'Weather Event',
    start: 'Start / HQ',
    return: 'Return to HQ',
  };


  const deckChoices = [
    { deck: 'station', label: 'Station card' },
    { deck: 'variable', label: 'Variable card' },
    { deck: 'data-cleaning', label: 'Data Cleaning card' },
    { deck: 'exam-trap', label: 'Exam Trap card' },
    { deck: 'challenge', label: 'Challenge card' },
  ];

  const reviewDecks = [
    { id: 'station', name: 'Station Cards', shortLabel: 'Station', description: 'Locations, station facts and weather patterns', color: 'var(--blue)', cardClass: 'station' },
    { id: 'variable', name: 'Variable Cards', shortLabel: 'Variable', description: 'Units, accuracy and variable types', color: 'var(--green-border)', cardClass: 'variable' },
    { id: 'data-cleaning', name: 'Data Cleaning Cards', shortLabel: 'Data Cleaning', description: 'tr, n/a and invalid entries', color: 'var(--orange-border)', cardClass: 'data-cleaning' },
    { id: 'exam-trap', name: 'Exam Trap Cards', shortLabel: 'Exam Trap', description: 'Common mistakes and precise LDS wording', color: 'var(--red-border)', cardClass: 'exam-trap' },
    { id: 'challenge', name: 'Challenge Cards', shortLabel: 'Challenge', description: 'Longer reasoning and interpretation', color: 'var(--purple-border)', cardClass: 'challenge' },
    { id: 'mixed', name: 'Mixed Review', shortLabel: 'Mixed', description: 'A blended self-quiz from every card set', color: 'var(--ink)', cardClass: 'mixed' },
  ];

  function deckForSpace(space) {
    return space.deck || {
      station: 'station',
      variable: 'variable',
      cleaning: 'data-cleaning',
      examTrap: 'exam-trap',
      challenge: 'challenge',
      return: 'challenge',
    }[space.type];
  }

  function tileClass(space) {
    return `space board-tile ${space.type}`;
  }

  function randomDeck() {
    return deckChoices[Math.floor(Math.random() * deckChoices.length)].deck;
  }

  const sound = {
    playCue(cueName) {
      if (state.isMuted) return;
      document.dispatchEvent(new CustomEvent('lds:sound-cue', { detail: { cueName } }));
    },
  };

  function wait(ms) {
    return new Promise((resolve) => { window.setTimeout(resolve, state.reducedMotion ? Math.min(ms, 40) : ms); });
  }

  function activeTeam() {
    return state.teams[state.activeTeamIndex];
  }

  function canRoll() {
    return state.appMode === APP_MODES.BOARD
      && state.gamePhase === TURN_PHASES.WAITING_TO_ROLL
      && !state.gameOver;
  }

  function canScore() {
    return [TURN_PHASES.SHOWING_QUESTION, TURN_PHASES.SCORING_QUESTION].includes(state.gamePhase)
      && Boolean(state.currentQuestionKey)
      && !state.hasScoredThisTurn
      && !state.gameOver
      && !state.scoredQuestionKeys.has(state.currentQuestionKey);
  }

  function setPhase(phase) {
    state.gamePhase = phase;
    state.gameOver = phase === TURN_PHASES.GAME_OVER;
    if (phase === TURN_PHASES.GAME_OVER && !state.reviewMode.isActive) state.appMode = APP_MODES.GAME_OVER;
    renderControls();
  }

  function byDeck(deck) {
    return data.cards.filter((card) => card.deck === deck);
  }


  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }[char]));
  }

  function reviewDeckById(deckId) {
    return reviewDecks.find((deck) => deck.id === deckId) || reviewDecks[reviewDecks.length - 1];
  }

  function reviewCardsForDeck(deckId) {
    const playableDecks = deckChoices.map((choice) => choice.deck);
    return deckId === 'mixed'
      ? data.cards.filter((card) => playableDecks.includes(card.deck))
      : byDeck(deckId);
  }

  function reviewDeckOptions() {
    return reviewDecks
      .map((deck) => ({ ...deck, count: reviewCardsForDeck(deck.id).length }))
      .filter((deck) => deck.count > 0);
  }

  function cardById(cardId) {
    return data.cards.find((card) => card.id === cardId);
  }

  function reviewCardsInOrder() {
    return state.reviewMode.cardOrder.map(cardById).filter(Boolean);
  }

  function currentReviewCard() {
    return reviewCardsInOrder()[state.reviewMode.currentCardIndex] || null;
  }

  function sourceDeckForCard(card) {
    return reviewDeckById(card?.deck || state.reviewMode.selectedDeckId || 'mixed');
  }

  function shuffleCards(cards) {
    const shuffled = [...cards];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  function reviewTransitionDuration(type) {
    if (state.reducedMotion) return type === 'overlay' ? 70 : 45;
    return { overlay: 320, cardExit: 160, cardEnter: 230 }[type] || 180;
  }

  function setReviewVisibility(isVisible, transitionClass = '') {
    if (!reviewModeEl) return;
    if (isVisible) {
      reviewModeEl.hidden = false;
      reviewModeEl.classList.remove('is-leaving');
      if (transitionClass) {
        reviewModeEl.classList.remove(transitionClass);
        void reviewModeEl.offsetWidth;
        reviewModeEl.classList.add(transitionClass);
      }
    } else {
      reviewModeEl.hidden = true;
      reviewModeEl.classList.remove('is-opening', 'is-leaving');
    }
    document.body.classList.toggle('review-active', isVisible);
    renderControls();
  }

  function clearReviewCardTransitionDom() {
    const card = reviewModeEl?.querySelector('.review-card');
    card?.classList.remove('is-entering', 'is-exiting', 'forward', 'backward', 'neutral');
    reviewModeEl?.querySelectorAll('[data-disable-during-card-transition]').forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      const disableAtBoundary = button.dataset.disableAtBoundary === 'true';
      button.disabled = disableAtBoundary;
    });
  }

  function openReviewDeckSelect() {
    const wasActive = state.reviewMode.isActive;
    if (state.reviewMode.isOverlayTransitioning) return;
    state.appMode = APP_MODES.CARD_REVIEW_DECK_SELECT;
    state.reviewMode.isActive = true;
    state.reviewMode.selectedDeckId = null;
    state.reviewMode.currentCardIndex = 0;
    state.reviewMode.cardOrder = [];
    state.reviewMode.isAnswerVisible = false;
    state.reviewMode.isCardTransitioning = false;
    state.reviewMode.transitionPhase = null;
    state.reviewMode.previousCardIndex = null;
    state.reviewMode.nextCardIndex = null;
    state.reviewMode.previousCardOrder = [];
    state.reviewMode.previousAnswerVisible = false;
    state.reviewMode.transitionDirection = 'neutral';
    setReviewVisibility(true, wasActive ? '' : 'is-opening');
    renderReviewMode();
  }

  async function closeReviewMode() {
    if (state.reviewMode.isOverlayTransitioning) return;
    state.reviewMode.isOverlayTransitioning = true;
    state.reviewMode.isCardTransitioning = false;
    state.reviewMode.transitionPhase = null;
    state.reviewMode.previousCardIndex = null;
    state.reviewMode.nextCardIndex = null;
    state.reviewMode.previousCardOrder = [];
    state.reviewMode.previousAnswerVisible = false;
    state.reviewMode.transitionDirection = 'neutral';
    if (reviewModeEl && !reviewModeEl.hidden) {
      reviewModeEl.classList.remove('is-opening');
      reviewModeEl.classList.add('is-leaving');
      await wait(reviewTransitionDuration('overlay'));
    }
    state.reviewMode.isActive = false;
    state.reviewMode.isAnswerVisible = false;
    state.reviewMode.isOverlayTransitioning = false;
    state.appMode = state.gameOver ? APP_MODES.GAME_OVER : APP_MODES.BOARD;
    setReviewVisibility(false);
  }

  function startReviewDeck(deckId, cards = reviewCardsForDeck(deckId)) {
    if (state.reviewMode.isCardTransitioning || state.reviewMode.isOverlayTransitioning) return;
    const shouldPlayOverlayEntry = !reviewModeEl || reviewModeEl.hidden;
    state.appMode = APP_MODES.CARD_REVIEW_ACTIVE;
    state.reviewMode.isActive = true;
    state.reviewMode.selectedDeckId = deckId;
    state.reviewMode.currentCardIndex = 0;
    state.reviewMode.cardOrder = cards.map((card) => card.id);
    state.reviewMode.isAnswerVisible = false;
    state.reviewMode.reviewedCards = new Set();
    state.reviewMode.gotItCards = new Set();
    state.reviewMode.needPracticeCards = new Set();
    state.reviewMode.isCardTransitioning = false;
    state.reviewMode.transitionPhase = 'entering';
    state.reviewMode.previousCardIndex = null;
    state.reviewMode.nextCardIndex = 0;
    state.reviewMode.previousCardOrder = [];
    state.reviewMode.previousAnswerVisible = false;
    state.reviewMode.transitionDirection = 'neutral';
    setReviewVisibility(true, shouldPlayOverlayEntry ? 'is-opening' : '');
    renderReviewMode();
    window.setTimeout(() => {
      if (state.appMode !== APP_MODES.CARD_REVIEW_ACTIVE) return;
      state.reviewMode.transitionPhase = null;
      state.reviewMode.nextCardIndex = null;
      clearReviewCardTransitionDom();
    }, reviewTransitionDuration('cardEnter'));
  }

  function renderReviewDeckSelect() {
    const deckCards = reviewDeckOptions().map((deck, index) => `
      <button class="review-deck-card" type="button" data-review-deck="${escapeHTML(deck.id)}" style="--review-deck-color: ${deck.color}; --deck-index: ${index}">
        <span class="review-deck-chip">${escapeHTML(deck.shortLabel)}</span>
        <strong>${escapeHTML(deck.name)}</strong>
        <span>${escapeHTML(deck.description)}</span>
        <em>${deck.count} card${deck.count === 1 ? '' : 's'}</em>
      </button>`).join('');

    reviewModeEl.innerHTML = `
      <div class="review-shell review-select-shell" role="dialog" aria-modal="true" aria-labelledby="reviewTitle">
        <div class="review-topbar">
          <button class="secondary" type="button" data-review-back-board>Back to Board</button>
          <div>
            <p class="eyebrow">Self-quiz mode</p>
            <h2 id="reviewTitle">Choose a card deck</h2>
          </div>
          <p class="review-key-hint">Esc returns to the board</p>
        </div>
        <div class="review-deck-grid">${deckCards}</div>
      </div>`;
  }

  function reviewCardMarkup(card, cardIndex, phase = '', direction = 'neutral', answerVisible = false) {
    if (!card) return '';
    const sourceDeck = sourceDeckForCard(card);
    const gotIt = state.reviewMode.gotItCards.has(card.id);
    const needPractice = state.reviewMode.needPracticeCards.has(card.id);
    const transitionClass = phase ? ` is-${phase} ${direction}` : '';

    return `
      <article class="review-card ${escapeHTML(sourceDeck.cardClass)}${transitionClass}" style="--review-card-color: ${sourceDeck.color}" tabindex="-1" data-review-card-index="${cardIndex}">
        <div class="review-card-meta">
          <span>${escapeHTML(card.id)}</span>
          <span>${escapeHTML(card.type || sourceDeck.shortLabel)}</span>
          <span>${escapeHTML(sourceDeck.shortLabel)}</span>
        </div>
        <h3>${escapeHTML(card.question)}</h3>
        <div class="review-answer${answerVisible ? ' visible' : ''}">
          <p class="eyebrow">Answer</p>
          <p>${escapeHTML(card.answer)}</p>
        </div>
        ${answerVisible ? `
          <div class="review-self-check" aria-label="Self assessment">
            <button class="secondary${gotIt ? ' selected' : ''}" type="button" data-review-mark="got">Got it</button>
            <button class="secondary${needPractice ? ' selected' : ''}" type="button" data-review-mark="practice">Need practice</button>
          </div>` : '<p class="review-answer-placeholder">Answer hidden — use Show Answer when you are ready.</p>'}
      </article>`;
  }

  function ensureReviewActiveShell() {
    if (reviewModeEl.querySelector('.review-card-shell')) return;
    reviewModeEl.innerHTML = `
      <div class="review-shell review-card-shell" role="dialog" aria-modal="true" aria-labelledby="reviewDeckTitle">
        <div class="review-topbar">
          <button class="secondary" type="button" data-review-back-board>Back to Board</button>
          <div data-review-heading></div>
          <p class="review-progress" data-review-progress></p>
        </div>
        <div class="review-card-stage" data-review-card-stage></div>
        <div data-review-complete-region></div>
        <div class="review-controls" aria-label="Review navigation" data-review-controls></div>
      </div>`;
  }

  function renderReviewActive() {
    const cards = reviewCardsInOrder();
    const card = currentReviewCard();
    const selectedDeck = reviewDeckById(state.reviewMode.selectedDeckId);
    if (!card || cards.length === 0) {
      renderReviewDeckSelect();
      return;
    }

    ensureReviewActiveShell();

    const isMixed = selectedDeck.id === 'mixed';
    const transitionDirection = state.reviewMode.transitionDirection || 'neutral';
    const isSwappingCards = state.reviewMode.isCardTransitioning
      && state.reviewMode.transitionPhase === 'swapping'
      && state.reviewMode.previousCardIndex !== null
      && state.reviewMode.nextCardIndex !== null;
    const displayIndex = isSwappingCards ? state.reviewMode.nextCardIndex : state.reviewMode.currentCardIndex;
    const displayCard = cards[displayIndex] || card;
    const sourceDeck = sourceDeckForCard(displayCard);
    const answerVisible = !isSwappingCards && state.reviewMode.isAnswerVisible;
    const atStart = displayIndex === 0;
    const atEnd = displayIndex === cards.length - 1;
    const reviewedCount = state.reviewMode.reviewedCards.size;
    const transitioningDisabled = state.reviewMode.isCardTransitioning ? 'disabled' : '';

    const headingEl = reviewModeEl.querySelector('[data-review-heading]');
    if (headingEl) {
      headingEl.innerHTML = `
        <p class="eyebrow">${escapeHTML(isMixed ? `${selectedDeck.name} · ${sourceDeck.shortLabel}` : 'Self-quiz mode')}</p>
        <h2 id="reviewDeckTitle">${escapeHTML(selectedDeck.name)}</h2>`;
    }

    const progressEl = reviewModeEl.querySelector('[data-review-progress]');
    if (progressEl) progressEl.textContent = `Card ${displayIndex + 1} of ${cards.length}`;

    const stageEl = reviewModeEl.querySelector('[data-review-card-stage]');
    if (stageEl) {
      if (isSwappingCards) {
        const previousOrder = state.reviewMode.previousCardOrder.length ? state.reviewMode.previousCardOrder : state.reviewMode.cardOrder;
        const previousCard = cardById(previousOrder[state.reviewMode.previousCardIndex]);
        const nextCard = cards[state.reviewMode.nextCardIndex];
        stageEl.innerHTML = `
          ${reviewCardMarkup(previousCard, state.reviewMode.previousCardIndex, 'exiting', transitionDirection, state.reviewMode.previousAnswerVisible)}
          ${reviewCardMarkup(nextCard, state.reviewMode.nextCardIndex, 'entering', transitionDirection, false)}`;
      } else {
        const phase = state.reviewMode.transitionPhase === 'entering' ? 'entering' : '';
        stageEl.innerHTML = reviewCardMarkup(displayCard, displayIndex, phase, transitionDirection, answerVisible);
      }
    }

    const completeMarkup = atEnd ? `
      <div class="review-complete" aria-live="polite">
        <strong>Deck complete</strong>
        <span>Total reviewed: ${reviewedCount} · Got it: ${state.reviewMode.gotItCards.size} · Need practice: ${state.reviewMode.needPracticeCards.size}</span>
      </div>` : '';
    const completeRegionEl = reviewModeEl.querySelector('[data-review-complete-region]');
    if (completeRegionEl) completeRegionEl.innerHTML = completeMarkup;

    const controlsEl = reviewModeEl.querySelector('[data-review-controls]');
    if (controlsEl) {
      controlsEl.innerHTML = `
        <button class="secondary" type="button" data-review-prev data-disable-during-card-transition data-disable-at-boundary="${atStart ? 'true' : 'false'}" ${atStart || state.reviewMode.isCardTransitioning ? 'disabled' : ''}>Previous Card</button>
        <button type="button" data-review-toggle-answer data-disable-during-card-transition ${transitioningDisabled}>${answerVisible ? 'Hide Answer' : 'Show Answer'}</button>
        <button class="secondary" type="button" data-review-next data-disable-during-card-transition data-disable-at-boundary="${atEnd ? 'true' : 'false'}" ${atEnd || state.reviewMode.isCardTransitioning ? 'disabled' : ''}>${atEnd ? 'Deck Complete' : 'Next Card'}</button>
        <button class="secondary" type="button" data-review-shuffle data-disable-during-card-transition ${transitioningDisabled}>Shuffle Deck</button>
        <button class="secondary" type="button" data-review-restart data-disable-during-card-transition ${transitioningDisabled}>Restart Deck</button>
        <button class="secondary" type="button" data-review-deck-select data-disable-during-card-transition ${transitioningDisabled}>Choose Deck</button>`;
    }
  }

  function renderReviewMode() {
    if (!reviewModeEl || !state.reviewMode.isActive) return;
    if (state.appMode === APP_MODES.CARD_REVIEW_ACTIVE) renderReviewActive();
    else renderReviewDeckSelect();
  }

  async function transitionReviewCard(nextIndex, direction, updateCards = null) {
    const cardsBeforeUpdate = reviewCardsInOrder();
    const currentIndex = state.reviewMode.currentCardIndex;
    const orderWillChange = typeof updateCards === 'function';
    const boundedBeforeUpdate = Math.min(Math.max(nextIndex, 0), Math.max(cardsBeforeUpdate.length - 1, 0));
    if (state.reviewMode.isCardTransitioning || (!orderWillChange && boundedBeforeUpdate === currentIndex && !state.reviewMode.isAnswerVisible)) return;

    state.reviewMode.isCardTransitioning = true;
    state.reviewMode.previousCardIndex = currentIndex;
    state.reviewMode.nextCardIndex = boundedBeforeUpdate;
    state.reviewMode.previousCardOrder = [...state.reviewMode.cardOrder];
    state.reviewMode.previousAnswerVisible = state.reviewMode.isAnswerVisible;
    state.reviewMode.transitionDirection = direction;
    state.reviewMode.transitionPhase = 'swapping';
    state.reviewMode.isAnswerVisible = false;

    if (orderWillChange) {
      updateCards();
      const cardsAfterUpdate = reviewCardsInOrder();
      state.reviewMode.nextCardIndex = Math.min(Math.max(nextIndex, 0), Math.max(cardsAfterUpdate.length - 1, 0));
    }

    renderReviewMode();
    await wait(Math.max(reviewTransitionDuration('cardExit'), reviewTransitionDuration('cardEnter')));
    if (!state.reviewMode.isActive || state.appMode !== APP_MODES.CARD_REVIEW_ACTIVE) return;

    state.reviewMode.currentCardIndex = state.reviewMode.nextCardIndex ?? boundedBeforeUpdate;
    state.reviewMode.isCardTransitioning = false;
    state.reviewMode.transitionPhase = null;
    state.reviewMode.previousCardIndex = null;
    state.reviewMode.nextCardIndex = null;
    state.reviewMode.previousCardOrder = [];
    state.reviewMode.previousAnswerVisible = false;
    renderReviewMode();
    clearReviewCardTransitionDom();
  }

  function moveReviewCard(delta) {
    const cards = reviewCardsInOrder();
    const nextIndex = Math.min(Math.max(state.reviewMode.currentCardIndex + delta, 0), cards.length - 1);
    transitionReviewCard(nextIndex, delta > 0 ? 'forward' : 'backward');
  }

  function toggleReviewAnswer() {
    if (state.reviewMode.isCardTransitioning) return;
    state.reviewMode.isAnswerVisible = !state.reviewMode.isAnswerVisible;
    const card = currentReviewCard();
    if (card && state.reviewMode.isAnswerVisible) state.reviewMode.reviewedCards.add(card.id);
    renderReviewMode();
  }

  function markReviewCard(mark) {
    if (state.reviewMode.isCardTransitioning) return;
    const card = currentReviewCard();
    if (!card) return;
    state.reviewMode.reviewedCards.add(card.id);
    if (mark === 'got') {
      state.reviewMode.gotItCards.add(card.id);
      state.reviewMode.needPracticeCards.delete(card.id);
    } else {
      state.reviewMode.needPracticeCards.add(card.id);
      state.reviewMode.gotItCards.delete(card.id);
    }
    renderReviewMode();
  }

  function restartReviewDeck() {
    transitionReviewCard(0, 'neutral');
  }

  function shuffleReviewDeck() {
    const deckId = state.reviewMode.selectedDeckId;
    const shuffled = shuffleCards(reviewCardsForDeck(deckId));
    transitionReviewCard(0, 'neutral', () => {
      state.reviewMode.cardOrder = shuffled.map((card) => card.id);
      state.reviewMode.reviewedCards = new Set();
      state.reviewMode.gotItCards = new Set();
      state.reviewMode.needPracticeCards = new Set();
    });
  }

  function stationImagePath(filename) {
    const pagePath = window.location.pathname.replace(/\/+$/, '/');
    const isWebEntry = pagePath.endsWith('/web/') || pagePath.endsWith('/web/index.html');
    const imageRoot = isWebEntry ? '../LDS_Board_game/images' : 'LDS_Board_game/images';
    return `${imageRoot}/${filename}`;
  }

  function boardGridPosition(spaceId) {
    if (spaceId <= 8) return { row: 1, col: spaceId + 1 };
    if (spaceId <= 15) return { row: 2, col: 17 - spaceId };
    if (spaceId <= 22) return { row: 3, col: spaceId - 14 };
    if (spaceId <= 30) return { row: 4, col: 32 - spaceId };
    return { row: spaceId === 32 ? 2 : 4, col: 1 };
  }

  function nextPosition(position) {
    return (position % data.board.length) + 1;
  }

  function currentSpace(team = activeTeam()) {
    return data.board.find((item) => item.id === team.position);
  }

  function applyActiveTheme() {
    const team = activeTeam();
    if (!team) return;
    document.documentElement.style.setProperty('--active-team-color', team.color);
    document.documentElement.style.setProperty('--active-team-color-soft', `color-mix(in srgb, ${team.color} 12%, white)`);
    document.documentElement.style.setProperty('--active-team-color-glow', `color-mix(in srgb, ${team.color} 28%, transparent)`);
    document.documentElement.style.setProperty('--active-team-color-strong-glow', `color-mix(in srgb, ${team.color} 42%, transparent)`);
  }

  function createRoutePath() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('route-path');
    svg.setAttribute('viewBox', '0 0 1000 400');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const route = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    route.classList.add('route-line');
    route.setAttribute(
      'd',
      [
        'M 150 50',
        'L 850 50',
        'C 925 50 925 150 750 150',
        'L 150 150',
        'C 75 150 75 250 150 250',
        'L 750 250',
        'C 925 250 925 350 850 350',
        'L 150 350',
        'C 75 350 50 305 50 250',
        'L 50 150',
        'C 50 95 75 50 150 50',
      ].join(' '),
    );
    svg.appendChild(route);

    const chevrons = [
      [200, 50, 0], [300, 50, 0], [400, 50, 0], [500, 50, 0], [600, 50, 0], [700, 50, 0], [800, 50, 0],
      [900, 95, 78], [840, 140, 150],
      [700, 150, 180], [600, 150, 180], [500, 150, 180], [400, 150, 180], [300, 150, 180], [200, 150, 180],
      [90, 205, 100], [95, 240, 42],
      [200, 250, 0], [300, 250, 0], [400, 250, 0], [500, 250, 0], [600, 250, 0], [700, 250, 0],
      [835, 270, 32], [900, 320, 98],
      [800, 350, 180], [700, 350, 180], [600, 350, 180], [500, 350, 180], [400, 350, 180], [300, 350, 180], [200, 350, 180],
      [70, 315, -105], [50, 220, -90], [58, 115, -62], [100, 72, -25],
    ];

    chevrons.forEach(([x, y, rotation]) => {
      const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      chevron.classList.add('route-chevron');
      chevron.setAttribute('points', '-8,-6 0,0 -8,6');
      chevron.setAttribute('transform', `translate(${x} ${y}) rotate(${rotation})`);
      svg.appendChild(chevron);
    });

    return svg;
  }

  function renderBoard() {
    boardEl.innerHTML = '<div class="board-ambient" aria-hidden="true"><span></span><span></span><span></span></div>';
    boardEl.appendChild(createRoutePath());
    data.board.forEach((space) => {
      const pos = boardGridPosition(space.id);
      const tile = document.createElement('article');
      tile.id = `space-${space.id}`;
      tile.className = tileClass(space);
      tile.style.gridRow = pos.row;
      tile.style.gridColumn = pos.col;
      if (space.id === 32 || space.id === 1) tile.classList.add('loop-return');

      const header = document.createElement('div');
      header.className = 'tile-header';

      const number = document.createElement('span');
      number.className = 'tile-number';
      number.textContent = space.id;
      header.appendChild(number);

      const title = document.createElement('span');
      title.className = 'tile-title';
      title.textContent = space.title || space.label;
      title.title = space.fullTitle || space.title || space.label;
      tile.title = space.fullTitle || space.description || space.title || space.label;
      header.appendChild(title);
      tile.appendChild(header);

      const visual = document.createElement('div');
      visual.className = 'tile-visual';

      if (space.visual || space.icon) {
        const icon = document.createElement('span');
        icon.className = 'tile-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = space.visual || space.icon;
        visual.appendChild(icon);
      }

      if (space.stationImage) {
        const img = document.createElement('img');
        img.src = stationImagePath(space.stationImage);
        img.alt = `${space.label} station`;
        img.addEventListener('error', () => {
          img.remove();
        });
        visual.appendChild(img);
      }
      tile.appendChild(visual);

      const label = document.createElement('div');
      label.className = 'tile-label';
      label.textContent = space.tileLabel || space.subtitle || deckLabels[space.type] || space.type;
      tile.appendChild(label);

      const counters = document.createElement('div');
      counters.className = 'counters';
      counters.dataset.countersFor = space.id;
      tile.appendChild(counters);
      boardEl.appendChild(tile);
    });
  }

  function resetTransientTurnState() {
    state.lastRoll = null;
    state.currentCard = null;
    state.currentCardOptions = null;
    state.currentQuestionKey = null;
    state.hasScoredThisTurn = false;
    state.scoreFeedback = null;
    state.choiceContext = null;
  }

  function startGame(teamCount) {
    state.teams = Array.from({ length: teamCount }, (_, index) => ({
      id: index + 1,
      name: teamNames[index],
      color: teamColors[index],
      position: 1,
      points: 0,
      badges: 0,
    }));
    state.activeTeamIndex = 0;
    state.drawnCards = {};
    state.scoredQuestionKeys = new Set();
    state.winningTeam = null;
    if (!state.reviewMode.isActive) state.appMode = APP_MODES.BOARD;
    resetTransientTurnState();
    setPhase(TURN_PHASES.WAITING_TO_ROLL);
    diceDisplayEl.textContent = '–';
    statusEl.textContent = `${activeTeam().name} starts at Met Office HQ. Roll the dice to begin.`;
    dismissGameplayCard({ immediate: true });
    renderCelebration();
    renderAll();
    pulseTurnChange();
  }

  function renderControls() {
    if (rollButton) rollButton.disabled = !canRoll();
    cardPanelEl.querySelectorAll('[data-score]').forEach((button) => {
      button.disabled = !canScore();
    });
  }

  function renderCounters(movingTeamId = null) {
    document.querySelectorAll('.counters').forEach((el) => { el.innerHTML = ''; });
    const teamsByPosition = state.teams.reduce((groups, team) => {
      groups[team.position] = groups[team.position] || [];
      groups[team.position].push(team);
      return groups;
    }, {});

    Object.entries(teamsByPosition).forEach(([position, teams]) => {
      const holder = document.querySelector(`[data-counters-for="${position}"]`);
      if (!holder) return;
      teams.forEach((team, stackIndex) => {
        const counter = document.createElement('span');
        counter.className = `counter${team.id === activeTeam().id ? ' active-counter' : ''}${team.id === movingTeamId ? ' piece-step' : ''}`;
        counter.style.setProperty('--team-color', team.color);
        counter.style.setProperty('--stack-x', `${(stackIndex - (teams.length - 1) / 2) * 0.48}rem`);
        counter.style.setProperty('--stack-y', `${(stackIndex % 2) * 0.28}rem`);
        counter.title = team.name;
        counter.setAttribute('aria-label', `${team.name} counter on space ${position}`);
        holder.appendChild(counter);
      });
    });
  }

  function badgeTray(team, animateLatest = false) {
    const badges = Array.from({ length: Math.max(team.badges, 0) }, (_, index) => (
      `<span class="badge-token${animateLatest && index === team.badges - 1 ? ' badge-pop' : ''}" aria-label="Badge ${index + 1}">★</span>`
    )).join('');
    return `<div class="badge-tray" aria-label="${team.badges} badges collected">${badges || '<span class="muted">No badges yet</span>'}</div>`;
  }

  function scoreFeedbackMarkup(team) {
    if (!state.scoreFeedback || state.scoreFeedback.teamId !== team.id) return '';
    return `<span class="score-feedback ${state.scoreFeedback.points === 2 ? 'strong' : ''}${state.scoreFeedback.points === 0 ? ' neutral' : ''}">${state.scoreFeedback.label}</span>`;
  }

  function badgeProgressPoints(team) {
    return team.points % POINTS_PER_BADGE;
  }

  function badgeProgressLabel(team) {
    const progressPoints = badgeProgressPoints(team);
    return team.badges >= WINNING_BADGES
      ? `${team.badges} / ${WINNING_BADGES} badges`
      : `${progressPoints} / ${POINTS_PER_BADGE} pts to next badge`;
  }

  function renderScoreboard(animateBadgeTeamId = null) {
    scoreboardEl.innerHTML = '';
    state.teams.forEach((team, index) => {
      const space = currentSpace(team);
      const card = document.createElement('section');
      card.className = `team-score${index === state.activeTeamIndex ? ' active' : ''}${team.id === animateBadgeTeamId ? ' badge-awarded' : ''}${state.scoreFeedback?.teamId === team.id ? ' score-pop' : ''}`;
      card.style.setProperty('--team-color', team.color);
      card.innerHTML = `
        <h3><span class="mini-token" aria-hidden="true"></span>${team.name}${index === state.activeTeamIndex ? '<span class="active-badge">Current turn</span>' : ''}</h3>
        <div class="team-stats"><span>Space ${team.position}: ${space.label}</span><span class="score-value">${badgeProgressLabel(team)} ${scoreFeedbackMarkup(team)}</span><span>${team.badges} / ${WINNING_BADGES} badges</span></div>
        ${badgeTray(team, team.id === animateBadgeTeamId)}`;
      scoreboardEl.appendChild(card);
    });
  }

  function renderTurn() {
    const team = activeTeam();
    const space = currentSpace(team);
    applyActiveTheme();
    turnTitleEl.innerHTML = state.gameOver
      ? `<span class="team-marker" aria-hidden="true"></span>Game complete`
      : `<span class="team-marker" aria-hidden="true"></span>Current turn: ${team.name}`;
    turnTitleEl.style.setProperty('--team-color', team.color);
    diceDisplayEl.style.setProperty('--team-color', team.color);
    if (turnMetricsEl) {
      turnMetricsEl.innerHTML = `
        <div><span>Team</span><strong>${team.name}</strong></div>
        <div><span>Position</span><strong>${space.id} · ${space.label}</strong></div>
        <div><span>Latest roll</span><strong>${state.lastRoll || '–'}</strong></div>
        <div><span>Next badge</span><strong>${badgeProgressPoints(team)} / ${POINTS_PER_BADGE} pts</strong></div>
        <div><span>Badges</span><strong>${team.badges} / ${WINNING_BADGES}</strong></div>
        <div><span>Turn state</span><strong>${state.hasScoredThisTurn ? 'Scored' : phaseLabel(state.gamePhase)}</strong></div>`;
    }
    renderControls();
  }

  function phaseLabel(phase) {
    return {
      [TURN_PHASES.WAITING_TO_ROLL]: 'Ready to roll',
      [TURN_PHASES.ROLLING_DICE]: 'Rolling dice',
      [TURN_PHASES.MOVING_PIECE]: 'Moving piece',
      [TURN_PHASES.RESOLVING_LANDING]: 'Resolving landing',
      [TURN_PHASES.CHOOSING_DECK]: 'Choosing deck',
      [TURN_PHASES.SHOWING_QUESTION]: 'Question open',
      [TURN_PHASES.SCORING_QUESTION]: 'Scoring',
      [TURN_PHASES.CHANGING_TURN]: 'Changing turn',
      [TURN_PHASES.GAME_OVER]: 'Game over',
    }[phase] || 'Playing';
  }

  function renderAll(movingTeamId = null, animateBadgeTeamId = null) {
    renderCounters(movingTeamId);
    renderScoreboard(animateBadgeTeamId);
    renderTurn();
  }

  async function rollDiceAnimation(finalValue) {
    setPhase(TURN_PHASES.ROLLING_DICE);
    sound.playCue('dice-roll');
    diceDisplayEl.classList.remove('dice-settle');
    diceDisplayEl.classList.add('dice-rolling');
    const duration = state.reducedMotion ? 80 : 950;
    const started = performance.now();

    while (performance.now() - started < duration) {
      diceDisplayEl.textContent = Math.floor(Math.random() * 6) + 1;
      await wait(state.reducedMotion ? 35 : 90);
    }

    diceDisplayEl.textContent = finalValue;
    diceDisplayEl.classList.remove('dice-rolling');
    diceDisplayEl.classList.add('dice-settle');
    await wait(state.reducedMotion ? 40 : 220);
    diceDisplayEl.classList.remove('dice-settle');
  }

  async function movePieceAlongRoute(team, steps) {
    setPhase(TURN_PHASES.MOVING_PIECE);
    dismissGameplayCard({ immediate: true });
    sound.playCue('piece-move');
    boardEl.classList.add('route-pulse');

    for (let step = 0; step < steps; step += 1) {
      if (state.gameOver) break;
      team.position = nextPosition(team.position);
      if (team.position === 1 && step < steps - 1) {
        statusEl.textContent = `${team.name} passed through the HQ Checkpoint and keeps moving.`;
        boardEl.classList.add('checkpoint-pass');
      } else {
        boardEl.classList.remove('checkpoint-pass');
      }
      renderAll(team.id);
      await wait(state.reducedMotion ? 40 : 210);
    }

    boardEl.classList.remove('route-pulse', 'checkpoint-pass');
    renderAll();
    return currentSpace(team);
  }

  async function highlightSquare(space, color) {
    const tile = document.getElementById(`space-${space.id}`);
    if (!tile) return;
    tile.style.setProperty('--landing-color', color);
    tile.classList.remove('landing-highlight');
    void tile.offsetWidth;
    tile.classList.add('landing-highlight');
    await wait(state.reducedMotion ? 80 : 760);
    tile.classList.remove('landing-highlight');
  }

  function dismissGameplayCard({ immediate = false } = {}) {
    if (!cardPanelEl) return;
    document.body.classList.remove('game-card-active');
    if (!immediate) cardPanelEl.classList.add('card-dismiss');
    cardPanelEl.hidden = true;
    cardPanelEl.innerHTML = '';
    if (immediate) cardPanelEl.classList.remove('card-dismiss');
  }

  async function revealCard(renderCallback) {
    if (!cardPanelEl) return;
    cardPanelEl.hidden = false;
    cardPanelEl.classList.remove('card-dismiss');
    document.body.classList.add('game-card-active');
    renderCallback();
    sound.playCue('card-reveal');
    const card = cardPanelEl.querySelector('.game-card');
    if (card) {
      card.classList.add('card-reveal');
      await wait(state.reducedMotion ? 60 : 420);
      card.classList.remove('card-reveal');
    }
    setPhase(TURN_PHASES.SHOWING_QUESTION);
    renderControls();
  }

  async function rollDie() {
    if (!canRoll()) return;
    const team = activeTeam();
    const roll = Math.floor(Math.random() * 6) + 1;
    state.lastRoll = roll;
    state.currentCard = null;
    state.currentCardOptions = null;
    state.currentQuestionKey = null;
    renderTurn();
    await rollDiceAnimation(roll);
    const space = await movePieceAlongRoute(team, roll);
    statusEl.textContent = `${team.name} rolled ${roll} and landed on space ${space.id}: ${space.label}.`;
    await highlightSquare(space, team.color);
    handleLanding(space);
  }

  function scoringButtonsMarkup() {
    return `
      <div class="scoring" aria-label="Choose points for this turn">
        <button type="button" data-score="0">0 points<br><small>No points this time</small></button>
        <button type="button" data-score="1">1 point<br><small>Good answer</small></button>
        <button type="button" data-score="2">2 points<br><small>Excellent explanation</small></button>
      </div>`;
  }

  function handleLanding(space) {
    if (state.gameOver) return;
    setPhase(TURN_PHASES.RESOLVING_LANDING);
    const team = activeTeam();
    state.currentQuestionKey = `landing:${team.id}:${Date.now()}:${space.id}:${space.type}`;

    if (space.type === 'start') {
      statusEl.textContent = `${team.name} landed exactly on Space 1: HQ Checkpoint.`;
      renderDeckChoicePanel({
        title: 'HQ Checkpoint',
        meta: 'Met Office HQ · Choose your challenge',
        intro: 'Choose any deck for a normal question. Passing through HQ does not interrupt movement; landing here opens this checkpoint.',
        context: 'hq',
        includeRandom: true,
      });
      return;
    }

    if (space.type === 'bonus' || space.type === 'weatherEvent') {
      renderDeckChoicePanel({
        title: `${space.label} Space! Choose a question deck.`,
        meta: space.type === 'weatherEvent' ? 'Weather Event · Choose Deck' : 'Bonus Space · Choose Deck',
        intro: 'Choose your best deck. Deck choice does not award points — score 0, 1, or 2 after the card.',
        context: space.type,
        includeRandom: true,
      });
      return;
    }

    if (space.type === 'return') {
      statusEl.textContent = `${team.name} reached Space 32: Return to HQ Challenge.`;
      drawCard('challenge', { titleOverride: 'Return to HQ Challenge', context: 'return' });
      return;
    }

    const deck = deckForSpace(space);
    if (deck) {
      drawCard(deck, { context: space.type });
      return;
    }

    renderSafeRest(space);
  }

  function deckChoiceButtonsMarkup(includeRandom) {
    const buttons = deckChoices
      .map((choice) => `<button type="button" data-choose-deck="${choice.deck}">${choice.label}</button>`)
      .join('');
    const random = includeRandom ? '<button type="button" data-choose-deck="random">Random deck</button>' : '';
    return `<div class="deck-choice-grid">${buttons}${random}</div>`;
  }

  async function renderDeckChoicePanel({ title, meta, intro, context, includeRandom = false }) {
    setPhase(TURN_PHASES.CHOOSING_DECK);
    state.currentCard = null;
    state.currentCardOptions = null;
    state.choiceContext = context;
    state.currentQuestionKey = `choice:${activeTeam().id}:${Date.now()}:${context}`;
    await revealCard(() => {
      cardPanelEl.innerHTML = `
        <div class="game-card deck-choice ${context}">
          <p class="card-meta">${meta}</p>
          <h3>${title}</h3>
          <p>${intro}</p>
          ${deckChoiceButtonsMarkup(includeRandom)}
          <p class="muted choice-note">Normal scoring applies after the card: 0, 1 or 2 points.</p>
        </div>`;
    });
    setPhase(TURN_PHASES.CHOOSING_DECK);
    renderControls();
  }

  function chooseDeck(deck, context = 'choice') {
    if (state.gamePhase !== TURN_PHASES.CHOOSING_DECK || state.hasScoredThisTurn || state.gameOver) return;
    const selectedDeck = deck === 'random' ? randomDeck() : deck;
    statusEl.textContent = `${activeTeam().name} chose the ${deckLabels[selectedDeck]} deck.`;
    const landingContext = state.choiceContext || context;
    drawCard(selectedDeck, { context: landingContext, titleOverride: landingContext === 'hq' ? 'HQ Checkpoint Question' : null });
  }


  function drawCard(deck, options = {}) {
    const cards = byDeck(deck);
    state.drawnCards[deck] = state.drawnCards[deck] || [];

    if (!cards.length) {
      state.currentCard = null;
      state.currentCardOptions = null;
      state.currentQuestionKey = `missing-card:${activeTeam().id}:${Date.now()}:${deck}:${options.context || state.choiceContext || 'unknown'}`;
      revealCard(() => {
        cardPanelEl.innerHTML = `
          <div class="game-card ${deck}">
            <p class="card-meta">${deckLabels[deck] || deck} deck</p>
            <h3>No cards available</h3>
            <p>No cards were found for the ${deckLabels[deck] || deck} deck.</p>
            ${scoringButtonsMarkup()}
          </div>`;
      });
      return;
    }

    if (state.drawnCards[deck].length >= cards.length) state.drawnCards[deck] = [];

    const remaining = cards.filter((card) => !state.drawnCards[deck].includes(card.id));
    const card = remaining[Math.floor(Math.random() * remaining.length)];
    const context = options.context || state.choiceContext || currentSpace()?.type || 'draw';

    state.drawnCards[deck].push(card.id);
    state.currentCard = card;
    state.currentCardOptions = { ...options, context };
    state.currentQuestionKey = `card:${activeTeam().id}:${context}:${card.id}:${Date.now()}`;
    revealCard(() => renderCard(card, false, options));
  }

  function renderCard(card, revealAnswer, options = {}) {
    const savedOptions = card === state.currentCard && state.currentCardOptions ? state.currentCardOptions : {};
    const renderOptions = { ...savedOptions, ...options };
    const displayTitle = renderOptions.titleOverride || card.title;
    const contextClass = renderOptions.context ? ` ${renderOptions.context}` : '';
    const originalTitle = displayTitle === card.title ? '' : `<p class="muted card-source-title">${card.title}</p>`;

    cardPanelEl.innerHTML = `
      <div class="game-card ${card.deck}${contextClass}">
        <p class="card-meta">Deck: ${card.deck} · ${card.type}</p>
        <h3>${displayTitle}</h3>
        ${originalTitle}
        <p class="card-question">${card.question}</p>
        ${revealAnswer ? `<div class="answer"><strong>Answer:</strong> ${card.answer || 'No answer was found in the answer key.'}</div>` : '<button type="button" data-reveal="answer">Reveal answer</button>'}
        ${scoringButtonsMarkup()}
      </div>`;
  }

  function renderSafeRest(space) {
    revealCard(() => {
      cardPanelEl.innerHTML = `<div class="game-card safe-rest"><p class="card-meta">Safe space</p><h3>${space.label}</h3><p>${space.description || 'This is an explicit rest space.'}</p>${scoringButtonsMarkup()}</div>`;
    });
  }

  function feedbackLabel(points) {
    if (points === 0) return '+0 · No points this time';
    if (points === 1) return '+1';
    return '+2 · Excellent explanation';
  }

  async function scoreCurrentQuestion(points) {
    if (!canScore()) return;
    if (![0, 1, 2].includes(points)) return;

    setPhase(TURN_PHASES.SCORING_QUESTION);
    state.hasScoredThisTurn = true;
    state.scoredQuestionKeys.add(state.currentQuestionKey);
    dismissGameplayCard();
    renderControls();

    const team = activeTeam();
    team.points += points;
    const newBadgeCount = Math.floor(team.points / POINTS_PER_BADGE);
    const earnedBadge = newBadgeCount > team.badges;
    if (earnedBadge) team.badges = newBadgeCount;
    state.scoreFeedback = { teamId: team.id, points, label: feedbackLabel(points) };
    statusEl.textContent = points === 0
      ? `${team.name}: no points this time. The turn will pass on automatically.`
      : `${team.name} earned ${points} point${points === 1 ? '' : 's'}!`;
    sound.playCue(points === 0 ? 'score-neutral' : 'score-award');
    renderAll(null, earnedBadge ? team.id : null);

    const winningTeam = team.badges >= WINNING_BADGES ? team : null;
    await wait(state.reducedMotion ? 80 : 750);

    if (winningTeam) {
      await finishGame(winningTeam);
      return;
    }

    await advanceTurn();
  }

  async function finishGame(team) {
    state.winningTeam = { ...team };
    setPhase(TURN_PHASES.GAME_OVER);
    statusEl.textContent = `${team.name} wins with ${WINNING_BADGES} badges!`;
    dismissGameplayCard({ immediate: true });
    renderAll();
    await wait(state.reducedMotion ? 80 : 260);
    renderCelebration();
  }

  async function advanceTurn() {
    setPhase(TURN_PHASES.CHANGING_TURN);
    dismissGameplayCard();
    await wait(state.reducedMotion ? 50 : 260);
    state.activeTeamIndex = (state.activeTeamIndex + 1) % state.teams.length;
    resetTransientTurnState();
    diceDisplayEl.textContent = '–';
    cardPanelEl.classList.remove('card-dismiss');
    setPhase(TURN_PHASES.WAITING_TO_ROLL);
    statusEl.textContent = `${activeTeam().name} is ready to roll.`;
    renderAll();
    pulseTurnChange();
  }

  function pulseTurnChange() {
    state.turnAnimationKey += 1;
    document.querySelector('.action-panel')?.classList.remove('turn-panel-pulse');
    turnTitleEl.classList.remove('turn-change');
    const activeScore = scoreboardEl.querySelector('.team-score.active');
    activeScore?.classList.remove('turn-score-pulse');
    void turnTitleEl.offsetWidth;
    document.querySelector('.action-panel')?.classList.add('turn-panel-pulse');
    turnTitleEl.classList.add('turn-change');
    activeScore?.classList.add('turn-score-pulse');
    window.setTimeout(() => {
      document.querySelector('.action-panel')?.classList.remove('turn-panel-pulse');
      turnTitleEl.classList.remove('turn-change');
      activeScore?.classList.remove('turn-score-pulse');
    }, state.reducedMotion ? 80 : 520);
  }

  function renderCelebration() {
    if (!celebrationOverlayEl) return;
    const winner = state.winningTeam;
    celebrationOverlayEl.hidden = !winner;
    celebrationOverlayEl.innerHTML = '';
    if (!winner) return;
    celebrationOverlayEl.style.setProperty('--winner-color', winner.color);
    const badges = `${winner.badges} / ${WINNING_BADGES} badges collected`;
    const pointProgress = `${badgeProgressPoints(winner)} / ${POINTS_PER_BADGE} points toward the next badge`;
    celebrationOverlayEl.innerHTML = `
      <div class="celebration-card" role="dialog" aria-modal="true" aria-labelledby="winnerTitle">
        <div class="sparkles" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
        <div class="winner-token" aria-hidden="true"></div>
        <p class="eyebrow">LDS Champions</p>
        <h2 id="winnerTitle">${winner.name} wins!</h2>
        <p class="winner-summary">${winner.name} wins by collecting <strong>${WINNING_BADGES} badges</strong>.</p>
        <p class="winner-summary">${badges} · ${pointProgress}</p>
        <button id="playAgainButton" type="button">Play again</button>
      </div>`;
    document.getElementById('playAgainButton').addEventListener('click', () => startGame(state.teams.length || Number(teamCountSelect.value)));
  }

  function renderRules() {
    document.getElementById('rulesList').innerHTML = data.rules.summary.map((item) => `<li>${item}</li>`).join('');
    document.getElementById('bonusList').innerHTML = data.rules.bonus.map((item) => `<li>${item}</li>`).join('');
  }

  function syncPreferences() {
    document.body.classList.toggle('reduced-motion', state.reducedMotion);
    if (muteToggle) muteToggle.checked = state.isMuted;
    if (motionToggle) motionToggle.checked = state.reducedMotion;
  }

  function onMediaQueryChange(query, handler) {
    if (query.addEventListener) {
      query.addEventListener('change', handler);
      return;
    }
    if (query.addListener) query.addListener(handler);
  }

  rollButton.addEventListener('click', rollDie);
  if (muteToggle) {
    muteToggle.addEventListener('change', () => {
      state.isMuted = muteToggle.checked;
      syncPreferences();
    });
  }
  if (motionToggle) {
    motionToggle.addEventListener('change', () => {
      state.reducedMotion = motionToggle.checked;
      syncPreferences();
    });
  }
  onMediaQueryChange(reducedMotionQuery, (event) => {
    state.reducedMotion = event.matches;
    syncPreferences();
  });
  teamForm.addEventListener('submit', (event) => {
    event.preventDefault();
    startGame(Number(teamCountSelect.value));
  });
  if (resetButton) {
    resetButton.addEventListener('click', () => startGame(state.teams.length || Number(teamCountSelect.value)));
  }
  reviewEntryButtons.forEach((button) => button.addEventListener('click', openReviewDeckSelect));
  if (reviewModeEl) {
    reviewModeEl.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const deckButton = target.closest('[data-review-deck]');
      if (deckButton instanceof HTMLElement) startReviewDeck(deckButton.dataset.reviewDeck);
      if (target.closest('[data-review-back-board]')) closeReviewMode();
      if (target.closest('[data-review-deck-select]')) openReviewDeckSelect();
      if (target.closest('[data-review-prev]')) moveReviewCard(-1);
      if (target.closest('[data-review-next]')) moveReviewCard(1);
      if (target.closest('[data-review-toggle-answer]')) toggleReviewAnswer();
      if (target.closest('[data-review-restart]')) restartReviewDeck();
      if (target.closest('[data-review-shuffle]')) shuffleReviewDeck();
      const markButton = target.closest('[data-review-mark]');
      if (markButton instanceof HTMLElement) markReviewCard(markButton.dataset.reviewMark);
    });
  }
  document.addEventListener('keydown', (event) => {
    if (!state.reviewMode.isActive) return;
    if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (state.appMode === APP_MODES.CARD_REVIEW_ACTIVE) openReviewDeckSelect();
      else closeReviewMode();
    } else if (state.appMode === APP_MODES.CARD_REVIEW_ACTIVE && event.key === 'ArrowRight') {
      event.preventDefault();
      moveReviewCard(1);
    } else if (state.appMode === APP_MODES.CARD_REVIEW_ACTIVE && event.key === 'ArrowLeft') {
      event.preventDefault();
      moveReviewCard(-1);
    } else if (state.appMode === APP_MODES.CARD_REVIEW_ACTIVE && (event.key === ' ' || event.key === 'Enter')) {
      if (event.target instanceof HTMLElement && event.target.closest('button')) return;
      event.preventDefault();
      toggleReviewAnswer();
    }
  });
  cardPanelEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const scoreButton = target.closest('[data-score]');
    const revealButton = target.closest('[data-reveal="answer"]');
    const deckButton = target.closest('[data-choose-deck]');
    if (deckButton instanceof HTMLElement) chooseDeck(deckButton.dataset.chooseDeck, state.choiceContext || 'choice');
    if (revealButton && state.currentCard && !state.gameOver && !state.hasScoredThisTurn) revealCard(() => renderCard(state.currentCard, true));
    if (scoreButton instanceof HTMLElement) scoreCurrentQuestion(Number(scoreButton.dataset.score));
  });
  document.getElementById('helpButton').addEventListener('click', () => rulesDialog.showModal());

  renderBoard();
  renderRules();
  syncPreferences();
  startGame(2);
}());
