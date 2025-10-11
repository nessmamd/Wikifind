const words = [
    'Serendipity', 'Ethereal', 'Luminous', 'Cascade', 'Velvet',
    'Whisper', 'Aurora', 'Harmony', 'Zenith', 'Radiant',
    'Nebula', 'Crystal', 'Phoenix', 'Tranquil', 'Enigma',
    'Pristine', 'Euphoria', 'Solstice', 'Gossamer', 'Reverie',
    'Moonlight', 'Sapphire', 'Thunder', 'Blossom', 'Infinity'
  ];
  
  let currentWord = words[Math.floor(Math.random() * words.length)];
  let showStats = false;
  
  const stats = {
    gamesPlayed: 42,
    wins: 38,
    currentStreak: 5,
    maxStreak: 12,
    winRate: 90
  };
  
  function render() {
    const app = document.getElementById('app');
    
    if (showStats) {
      app.innerHTML = `
        <div class="stats-container">
          <div class="stats-header">
            <h2>Statistics</h2>
            <button class="close-btn" id="closeStats">Close</button>
          </div>
  
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${stats.gamesPlayed}</div>
              <div class="stat-label">Played</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${stats.winRate}%</div>
              <div class="stat-label">Win Rate</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${stats.currentStreak}</div>
              <div class="stat-label">Current Streak</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${stats.maxStreak}</div>
              <div class="stat-label">Max Streak</div>
            </div>
          </div>
  
          <div class="total-wins">
            <div class="stat-value">${stats.wins}</div>
            <div class="stat-label">Total Wins</div>
          </div>
        </div>
      `;
      
      document.getElementById('closeStats').addEventListener('click', () => {
        showStats = false;
        render();
      });
    } else {
      app.innerHTML = `
        <div class="container">
          <div class="header">
            <h1>Wiki Degree Game</h1>
          </div>
  
          <button class="stats-btn" id="statsBtn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" x2="12" y1="20" y2="10"></line>
              <line x1="18" x2="18" y1="20" y2="4"></line>
              <line x1="6" x2="6" y1="20" y2="16"></line>
            </svg>
          </button>
  
          <div class="content">
            <div class="word-display" id="wordDisplay">
              <div class="word">${currentWord}</div>
            </div>
  
            <button class="new-word-btn" id="newWordBtn">New Word</button>
          </div>
        </div>
      `;
  
      document.getElementById('statsBtn').addEventListener('click', () => {
        showStats = true;
        render();
      });
  
      document.getElementById('newWordBtn').addEventListener('click', () => {
        const wordDisplay = document.getElementById('wordDisplay');
        wordDisplay.style.opacity = '0';
        
        setTimeout(() => {
          currentWord = words[Math.floor(Math.random() * words.length)];
          wordDisplay.querySelector('.word').textContent = currentWord;
          wordDisplay.style.opacity = '1';
        }, 200);
      });
    }
  }
  
  render();