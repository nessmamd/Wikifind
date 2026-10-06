  async function getRandomWikipediaArticle() {
    const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1&origin=*';
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      const article = data.query.random[0];
      
      return {
        title: article.title,
        id: article.id,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`
      };
    } catch (error) {
      console.error('Error fetching random article:', error);
      return null;
    }
  }

  async function getRandomArticlePair() {
    const startArticle = await getRandomWikipediaArticle();
    const targetArticle = await getRandomWikipediaArticle();
    
    if (startArticle.id === targetArticle.id) {
      return getRandomArticlePair();
    }
    
    return {
      start: startArticle,
      target: targetArticle
    };
  }

  async function testAPI() {
    console.log('Getting random article pair...');
    
    const pair = await getRandomArticlePair();
    
    console.log('Start Article:', pair.start.title);
    console.log('Start URL:', pair.start.url);
    console.log('Target Article:', pair.target.title);
    console.log('Target URL:', pair.target.url);
    
    return pair;
  }

  function openWikiPage(url) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.update(tabs[0].id, { url: url });
    });
  }

  async function testingWords(){
    currentWord = "Lehmbruck";
    targetWord = "Germany";

    chrome.storage.local.set({ 
      currentGame: {
        startArticle: currentWord,
        targetArticle: targetWord,
        startTime: Date.now(),
        clickCount: 0, 
        startUrl: "https://en.wikipedia.org/wiki/Lehmbruck",
        lastUrl: "https://en.wikipedia.org/wiki/Germany",
        allUrls: []
      }
    });
  }

  async function loadNewWords() {
    // testingWords(); 
    const pairs = await getRandomArticlePair();
    currentWord = pairs.start.title;
    targetWord = pairs.target.title;
    console.log('Start Article:', pairs.start.title);
    console.log('Start URL:', pairs.start.url);
    console.log('Target Article:', pairs.target.title);
    console.log('Target URL:', pairs.target.url);

    chrome.storage.local.set({ 
      currentGame: {
        startArticle: pairs.start.title,
        targetArticle: pairs.target.title,
        startTime: Date.now(),
        clickCount: 0, 
        startUrl: pairs.start.url,
        lastUrl: pairs.target.url,
        allUrls: []
      }
    });

    render(); // Update the display
  }

  const words = [
      'Loading....' 
    ];

  let currentWord = words[0];
  let targetWord = words[0];
  let showStats = false;
  
  const stats = {
    gamesPlayed: 42,
    wins: 38,
    currentStreak: 5,
    maxStreak: 12,
    winRate: 90
  };

  async function startingGame() { 
    chrome.storage.local.get(['currentGame'], (result) => {
      if (result.currentGame) {
        console.log('✅ Game exists:', result.currentGame);
        currentWord = result.currentGame.startArticle; 
        targetWord = result.currentGame.targetArticle;
        render(); 
      } else {
        console.log('❌ No game found in storage');
        loadNewWords(); 
      }
    });
  }

  //calling the game to start on it
  startingGame(); 

async function render() {
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
            
            <div class="word-display" id="wordDisplay">
              <div class="word">${targetWord}</div>
            </div>
  
            <button class="new-word-btn" id="newWordBtn">New Word</button>
            <button class="new-word-btn" id="newStartGame">Start Game</button> 
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
        loadNewWords(); 
      });

      document.getElementById('newStartGame').addEventListener('click', () => {
        chrome.storage.local.get(['currentGame'], (result) => {
          if (result.currentGame) {
            openWikiPage(result.currentGame.startUrl); 
            result.currentGame.allUrls = [];
            result.currentGame.clickCount = 0;
          } else {
            console.log('❌ No game found in storage');
            loadNewWords(); 
            openWikiPage(result.currentGame.startUrl); 
          }
        });
      }); 
    }
  }
  
  render();