# Wikirace Frontend

Web client for the Wikipedia Race Game. You start on one Wikipedia article and race to a target article using only the links in the text. You can play solo or in multiplayer rooms with live progress, and there are leaderboards plus a difficulty score from the ML engine.

It's plain HTML/CSS/JS with no build step and no framework. Flask serves it directly.

---

## File structure

```
templates/
  index.html        # page shell, loads the CSS and JS through url_for
static/
  css/style.css     # all styling, with light and dark themes
  js/app.js         # game logic, networking, demo mode
```

Put `templates/` and `static/` next to your Flask `app.py`:

```
your-project/
├── app.py
├── templates/
│   └── index.html
└── static/
    ├── css/style.css
    └── js/app.js
```

---

## Quick start

```python
# app.py
from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True, port=5001)  # 5000 is taken by macOS AirPlay Receiver
```

```bash
python3 -m venv .venv
.venv/bin/pip install flask
.venv/bin/python app.py
```

Open:

- **Demo mode:** `http://localhost:5001/`
- **Live mode:** `http://localhost:5001/?live=1`

---

## Demo mode vs. live mode

| | Demo (default) | Live (`?live=1`) |
|---|---|---|
| Articles | Real Wikipedia, through the parse API | Real Wikipedia, through the parse API |
| Multiplayer | 3 simulated racers on a mock socket | Your WebSocket server |
| Challenges and difficulty | Random start (`list=random`) plus a random walk of 2/3/5 links, in the browser | `GET /api/challenge` |
| Leaderboard | Seeded entries plus your runs in `localStorage` | `GET/POST` to your API |

Demo mode needs no backend, only internet access to Wikipedia. You can build the UI without the backend running, and you can demo the project to anyone.

### URL parameters

| Param | Default | Purpose |
|---|---|---|
| `live` | off | Set to `1` to use the real backend and real Wikipedia |
| `api` | `http://localhost:5000` | REST base URL |
| `ws` | `ws://localhost:5000/ws` | WebSocket URL |

Example: `/?live=1&api=https://myserver.com&ws=wss://myserver.com/ws`

If a live REST call fails, the client falls back to a practice challenge and shows a toast.

---

## Backend contract

The client expects the endpoints below. They're also documented in the comment block at the top of `app.js`.

### REST

#### `GET /api/challenge?difficulty=easy|medium|hard`

```json
{
  "id": "banana--moon",
  "start": "Banana",
  "target": "Moon",
  "par": 3,
  "optimal": ["Banana", "Plant", "Earth", "Moon"],
  "score": 2.4,
  "label": "easy",
  "drift": 1.0
}
```

- `par`: clicks in the shortest route.
- `optimal`: one shortest route, shown on the results screen.
- `score`: 1–10, from the ONNX difficulty model.
- `drift`: optional. Extra cost from category divergence (weighted Dijkstra cost minus `par`).

#### `GET /api/leaderboard?challenge=<id>`

```json
[{ "name": "nessma", "ms": 48213, "hops": 4 }]
```

Sorted fastest first. The client shows the top 8.

#### `POST /api/runs`

```json
{ "challengeId": "banana--moon", "name": "nessma", "ms": 48213, "hops": 4, "path": ["Banana", "..."] }
```

### WebSocket protocol

All messages are JSON with a `type` field.

**Client to server**

| type | fields | when |
|---|---|---|
| `create` | `name, challenge, solo` | Host makes a room (solo is a room of one) |
| `join` | `code, name` | Join an existing room |
| `start` | none | Host starts the race |
| `ready` | none | Player returns to the lobby after a race |
| `hop` | `article, hops` | Every click, including Back |
| `finish` | `ms, path` | Player reached the target |
| `forfeit` | none | Player gave up |
| `leave` | none | Player left the room |

**Server to client**

| type | fields | notes |
|---|---|---|
| `welcome` | `id` | This client's player id |
| `room` | `code, players[], challenge` | Send on every roster change. `players: [{id, name, host}]` |
| `start` | `startsAt, challenge` | `startsAt` is a ms epoch about 3s in the future, which drives the countdown |
| `progress` | `id, article, hops, dist` | Broadcast every hop. `dist` is hops left to the target (optional, drives the progress bars) |
| `finished` | `id, ms, hops` | A player finished |
| `forfeit` | `id` | A player gave up |

The server should broadcast `progress`, `finished`, and `forfeit` to everyone in the room, **including the sender**. The client updates its own progress bar from the echo.

---

## Integration notes

### Flask-Sock vs. Flask-SocketIO

The client uses the **native browser WebSocket**, which pairs with [Flask-Sock](https://github.com/miguelgrinberg/flask-sock):

```python
from flask_sock import Sock
import json

sock = Sock(app)

@sock.route("/ws")
def ws(conn):
    while True:
        msg = json.loads(conn.receive())
        # handle msg["type"] ...
        conn.send(json.dumps({"type": "welcome", "id": "abc123"}))
```

If you're using **Flask-SocketIO**, replace the `LiveSocket` class in `app.js` with the socket.io client. Every message is `{type, ...}`, so a single generic event handler works.

### Difficulty engine

In demo mode, `app.js` imitates the engine:

- Edge weight = `1 + divergence(categoryA, categoryB)`. Divergence is 0 for the same category, 0.5 for related categories, and 1 otherwise.
- The features are BFS par, Dijkstra cost, target in-degree, and whether the start and target categories differ. They're combined into a raw score and ranked into 1–10.

In live mode, the client shows whatever `score`, `label`, and `drift` your API returns. That's where the ONNX Runtime model plugs in.

### Article rendering (live mode)

Articles come from `https://en.wikipedia.org/w/api.php?action=parse&...&origin=*`. The client then cleans them up:

- It keeps only paragraphs, headings, and lists.
- It strips refs, tables, infoboxes, navboxes, and images.
- It rewrites `/wiki/` links into game links. Namespaced links like `File:` and `Category:` are dropped.
- It stops at References or External links.
- It follows redirects, so the path records the real article title.

---

## Game rules (as implemented)

- The timer starts after a 3-2-1 countdown that's synced to the server's `startsAt`.
- Every click counts, **including Back**.
- Links to visited articles turn purple, and the target link shows in red.
- Results show your route next to a shortest route, plus the room standings. Standings keep updating while others race.

---

## Customization

- **Colors and fonts:** CSS variables at the top of `style.css`. There's a light and a dark set, and they follow the system theme.
- **Demo articles:** the `ARTICLES` object in `app.js`. Links use `[[Title]]` or `[[Title|display text]]`. The graph, challenges, and difficulty scores rebuild automatically from it.
- **Bot racers:** the `BOTS` array in `app.js`. `pace` is ms per click, and `slip` is the chance of picking a wrong link.

---

## Known limitations

- Live mode needs the page served from your own host, such as localhost or your domain.
- Article fetching goes straight to Wikipedia from the browser. If you want server-side caching or link-graph validation, proxy it through Flask and change the URL in `liveArticle()`.
- Demo leaderboard entries are seeded and fake. Only your own demo runs are real, and they're stored in `localStorage`.
