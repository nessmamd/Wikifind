chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("hey we hear it all ??"); 
    if (message.type === 'WIKI_LINK_CLICKED') {
      handleLinkClick(message.data);
    } else if (message.type === 'GAME_WON') {
      handleGameWon(message.data, sender.tab.id);
    }
  });

function handleLinkClick(data) {
    chrome.storage.local.get(['currentGame'], (result) => {
      if (!result.currentGame) return;
      
      const updatedGame = {
        ...result.currentGame,
        clickCount: result.currentGame.clickCount + 1,
        lastUrl: data.url,
        allUrls: [...result.currentGame.allUrls, {
          title: data.title,
          url: data.url,
          timestamp: data.timestamp
        }]
      };
      
      chrome.storage.local.set({ currentGame: updatedGame });
      
      console.log('Click tracked:', data.title, '| Total clicks:', updatedGame.clickCount);
    });
}

function handleGameWon(data, tabId) {
    console.log('🎉 GAME WON!', data);
    
    chrome.storage.local.get(['stats', 'currentGame'], (result) => {
      const stats = result.stats || {
        gamesPlayed: 0,
        wins: 0,
        currentStreak: 0,
        maxStreak: 0,
        totalClicks: 0,
        bestGame: null
      };
      
      stats.gamesPlayed += 1;
      stats.wins += 1;
      stats.currentStreak += 1;
      stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
      stats.totalClicks += data.clickCount;
      stats.winRate = Math.round((stats.wins / stats.gamesPlayed) * 100);
      
      if (!stats.bestGame || data.clickCount < stats.bestGame.clicks) {
        stats.bestGame = {
          clicks: data.clickCount,
          time: data.timeTaken,
          from: result.currentGame.startArticle,
          to: result.currentGame.targetArticle,
          date: Date.now()
        };
      }
    
      chrome.action.setBadgeText({ text: '🎉' });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 0] });

      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_WIN_OVERLAY',
        data: data
      });

      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
      }, 3000); 
    });
  }