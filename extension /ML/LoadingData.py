import wikipediaapi
import json

def collect_articles_live(starting_articles, max_articles=1000):
    """
    Collect articles directly from Wikipedia API
    """
    wiki = wikipediaapi.Wikipedia(
        user_agent='WikiGameDifficultyEngine/1.0 (nessma@outlook.com)',
        language='en'
    )
    
    articles = {}
    to_visit = starting_articles.copy()
    visited = set()
    
    print("Collecting articles from Wikipedia API...")
    
    while to_visit and len(articles) < max_articles:
        title = to_visit.pop(0)
        
        if title in visited:
            continue
            
        visited.add(title)
        page = wiki.page(title)
        
        if not page.exists():
            continue
        
        # Extract categories (remove 'Category:' prefix)
        categories = [cat.replace('Category:', '') for cat in page.categories.keys()]
        
        # Extract links
        links = list(page.links.keys())
        
        # Store article data
        articles[title] = {
            'title': page.title,
            'categories': categories,
            'links': links
        }
        
        # Add some links to queue
        for link in links[:10]:  # Limit to avoid explosion
            if link not in visited:
                to_visit.append(link)
        
        if len(articles) % 100 == 0:
            print(f"Collected {len(articles)} articles...")
    
    print(f"Total articles collected: {len(articles)}")
    return articles

# Usage (just for now practice)
starting_points = [
    'Machine_learning',
    'History',
    'Biology',
    'Physics',
    'Music'
]

articles = collect_articles_live(starting_points, max_articles=1000)

# Save for later use
with open('wikipedia_articles.json', 'w', encoding='utf-8') as f:
    json.dump(articles, f, indent=2, ensure_ascii=False)
