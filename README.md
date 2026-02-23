# 🛒 Walmart Queue Monitor

A Tampermonkey userscript that adds a live overlay to Walmart's website showing your virtual queue status, estimated wait times, and real-time countdowns for high-demand items.

![Version](https://img.shields.io/badge/version-1.0-blue)
![Platform](https://img.shields.io/badge/platform-Tampermonkey%20%2F%20Greasemonkey-green)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

## What is this?

When Walmart drops high-demand items (limited-edition Pokémon cards, consoles, GPUs, etc.), they use a **virtual queue system** instead of letting everyone add to cart at once. You get placed in line and wait for your turn.

The problem: Walmart's queue page gives you vague messages like "You're in line!" with no real ETA or countdown. Under the hood, though, the queue API returns detailed data including estimated turn times, admission likelihood, and refresh intervals.

This script intercepts those API responses and displays all that hidden info in a clean, draggable overlay — complete with live countdowns.

## Features

- **Live countdown timers** — see exactly how long until your estimated turn, updated every second
- **Admission likelihood** — color-coded "likely" (green) / "unlikely" (red) indicators pulled from Walmart's own confidence assessment
- **Multi-item tracking** — monitors all your active queues simultaneously, sorted by likelihood and ETA
- **Pulsing alert** — countdown flashes when you're under 60 seconds, shows "YOUR TURN!" when it hits zero
- **Draggable & minimizable** — position the overlay wherever you want, collapse it when you don't need it
- **Zero configuration** — automatically detects queue data via network interception, no setup required
- **Non-invasive** — read-only, doesn't modify any requests or interact with Walmart's queue system

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Safari) or [Greasemonkey](https://www.greasespot.net/) (Firefox)
2. Click the Tampermonkey icon in your browser → **Create a new script**
3. Delete everything in the editor
4. Copy and paste the contents of [`monitor.js`](monitor.js)
5. Press **Ctrl+S** (or **Cmd+S**) to save
6. Enable developer mode in chrome extensions
   a. Go to chrome://extensions
   b. Enable Developer Mode (toggle in top-right)
7. Ensure User Scripts are allowed to run as well. You can find that in the extensions settings page in your desired browser
8. Navigate to [walmart.com](https://www.walmart.com) — you should see the overlay appear in the top-right corner

## Usage

Just browse Walmart normally. When you enter a virtual queue for any item, the script automatically detects the queue API responses and populates the overlay with:

| Field | Description |
|-------|-------------|
| **Item name** | Product name (truncated if long, hover for full name) |
| **Price** | Current listed price |
| **Status** | Queue state (`pending`, `valid`, `expired`) and admission likelihood (`likely`, `unlikely`) |
| **Ticket** | Your queue ticket ID |
| **Countdown** | Live countdown to your estimated turn time |

The overlay is **draggable** (click and drag the panel) and **minimizable** (click the `─` button in the header).

## How it works

The script hooks into the browser's `fetch()`, `XMLHttpRequest`, and `Response.prototype.json()` to intercept network responses. It identifies queue data in two ways:

1. **URL matching** — requests to URLs containing `q-api`, `queue`, `issueTicket`, `checkTicket`, or `refreshTicket`
2. **Shape detection** — any JSON response containing objects with `ticket`, `queue`, and `state` fields

This dual approach ensures detection works even if Walmart changes their API endpoint URLs.

### Queue data fields

For the curious, here's what Walmart's queue API returns:

```json
{
  "site": "usgm",
  "queue": "qa484c0ebd7014",
  "shard": 49,
  "ticket": 2529,
  "state": "pending",
  "expires": 1771034402836,
  "signature": "evse+tJEvFgVsOpinrNpD/aBXPv3UHVwqVv7j4wbQkE=",
  "itemId": "19012610850",
  "expectedTurnTimeUnixTimestamp": 1770951237733,
  "nextRefreshUnixTimestamp": 1770951214376,
  "nextRefreshRelativeTime": 36000,
  "customMetadata": {
    "admissionLikelihood": "likely",
    "title": "This deal is going fast",
    "item": {
      "name": "Pokemon Trading Card Games ...",
      "currentPrice": "$29.97",
      "itemID": "19012610850"
    }
  }
}
```

Key fields:

- **`expectedTurnTimeUnixTimestamp`** — rolling server estimate (in ms) of when it'll be your turn. This recalculates with every refresh and can shift forward or back.
- **`admissionLikelihood`** — Walmart's confidence that stock will remain when you reach the front. `"likely"` = good odds. `"unlikely"` = item may sell out before your turn.
- **`nextRefreshRelativeTime`** — how often (in ms) the page polls for updated queue data, typically every 20–40 seconds.
- **`state`** — `"pending"` (waiting), `"valid"` (your turn), or `"expired"`.
- **`ticket`** — your ticket ID in the queue (not necessarily your position in line).

## Troubleshooting

**Overlay appears but no items show up:**
- Open DevTools (F12) → Console tab and look for `[Queue Monitor]` messages
- You need to actually be in a queue — the overlay populates when queue API responses are detected
- Check the Network tab for the queue API request and note the URL. If it doesn't match the script's filters, open an issue with the URL pattern

**Overlay doesn't appear at all:**
- Make sure Tampermonkey is enabled and the script is toggled on
- Check that the `@match` pattern (`https://www.walmart.com/*`) covers the page you're on
- Try refreshing the page — the script runs at `document-start` so it needs to load before the page's own scripts

**Countdown shows wrong time:**
- The countdown is based on your local system clock vs. Walmart's server timestamps. If your clock is off, the countdown will be off.
- The ETA is a rolling estimate that recalculates every 20–40 seconds — it's normal for it to shift around

## Disclaimer

This script is for informational/educational purposes. It only reads data that Walmart's queue system already sends to your browser — it doesn't modify any requests, bypass the queue, or automate purchases. Use responsibly and in accordance with Walmart's Terms of Service.

## License

MIT
