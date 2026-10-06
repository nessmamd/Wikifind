console.log('Wiki page generated'); 

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_WIN_OVERLAY') {
    showWinOverlay(message.data);
  }
});

function showWinOverlay(data) {
  const style = document.createElement('style');
  style.textContent = `
    #wiki-congrats-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.4);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 999999;
      cursor: pointer;
    }

    .overlay-content {
      background: white;
      padding: 32px 48px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      animation: fadeIn 0.3s ease-out;
    }

    .overlay-content h1 {
      color: #1a1a1a;
      font-size: 28px;
      margin: 0 0 12px 0;
      text-align: center;
      font-family: 'Inter', -apple-system, sans-serif;
      font-weight: 500;
      letter-spacing: -0.02em;
    }

    .overlay-stats {
      color: #666;
      font-size: 15px;
      text-align: center;
      font-family: 'Inter', -apple-system, sans-serif;
      font-weight: 400;
    }

    @keyframes fadeIn {
      0% {
        transform: translateY(-10px);
        opacity: 0;
      }
      100% {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;

  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'wiki-congrats-overlay';
  
  const timeInSeconds = Math.round(data.timeTaken / 1000);
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = timeInSeconds % 60;
  const timeDisplay = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  
  overlay.innerHTML = `
    <div class="overlay-content">
      <h1> YAY you made the connections !! </h1>
      <div class="overlay-stats">
        Clicks: ${data.clickCount}  Time: ${timeDisplay}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => {
    overlay.remove();
  });
}

document.addEventListener('click', (e) => {
    const link = e.target.closest('a'); 
    
    if(!link) return;

    const href = link.getAttribute('href');
    if(!href || !href.startsWith('/wiki/')) return;

    if(href.includes(':') || href.includes('#')) return;

    const fullUrl = `https://en.wikipedia.org${href}`;
    const articleTitle = decodeURIComponent(href.replace('/wiki/', '').replace(/_/g, ' '));
    
    chrome.storage.local.get(['currentGame'], (result) => {
        if (!result.currentGame) return; 
        else{
            console.log("Are we adding it", result.currentGame.allUrls); 
        }
    });
    console.log("Already taken previously", ); 
    console.log('Wikipedia link clicked:', articleTitle);

    chrome.runtime.sendMessage({
        type: 'WIKI_LINK_CLICKED',
        data: {
          url: fullUrl,
          title: articleTitle,
          timestamp: Date.now()
        }
    });
}); 

chrome.storage.local.get(['currentGame'], (result) => {
    if (!result.currentGame) return; 

    const currentUrl = window.location.href;
    const currentTitle = document.title.replace(' - Wikipedia', '');

    if (currentTitle === result.currentGame.targetArticle) {
        chrome.runtime.sendMessage({
          type: 'GAME_WON',
          data: {
            clickCount: result.currentGame.clickCount,
            timeTaken: Date.now() - result.currentGame.startTime,
            path: result.currentGame.allUrls
          }
        });
      }

});