// Function to get a random Wikipedia article
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
  
  // Example usage:
  async function testAPI() {
    console.log('Getting random article pair...');
    
    const pair = await getRandomArticlePair();
    
    console.log('Start Article:', pair.start.title);
    console.log('Start URL:', pair.start.url);
    console.log('Target Article:', pair.target.title);
    console.log('Target URL:', pair.target.url);
    
    return pair;
  }
  
  // Call this to test
  testAPI();