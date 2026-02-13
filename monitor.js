// ==UserScript==
// @name         Walmart Queue Monitor
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Live overlay showing Walmart virtual queue status, ETAs, and countdowns
// @match        https://www.walmart.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const queueData = new Map(); // keyed by itemId

  // ── UI Setup ──────────────────────────────────────────────────────────────
  function createOverlay() {
    if (document.getElementById('wqm-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'wqm-overlay';
    overlay.innerHTML = `
      <style>
        #wqm-overlay {
          position: fixed;
          top: 12px;
          right: 12px;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          color: #e2e8f0;
          pointer-events: none;
        }
        #wqm-panel {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 14px 16px;
          min-width: 320px;
          max-width: 400px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          pointer-events: auto;
          cursor: move;
          user-select: none;
        }
        #wqm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #334155;
        }
        #wqm-title {
          font-size: 14px;
          font-weight: 700;
          color: #60a5fa;
          letter-spacing: 0.5px;
        }
        #wqm-badge {
          background: #1e3a5f;
          color: #93c5fd;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          font-weight: 600;
        }
        .wqm-item {
          background: #0f172a;
          border-radius: 8px;
          padding: 10px 12px;
          margin-bottom: 8px;
          border-left: 3px solid #475569;
          transition: border-color 0.3s;
        }
        .wqm-item:last-child { margin-bottom: 0; }
        .wqm-item.likely { border-left-color: #22c55e; }
        .wqm-item.unlikely { border-left-color: #ef4444; }
        .wqm-item.unknown { border-left-color: #eab308; }
        .wqm-item-name {
          font-weight: 600;
          font-size: 12px;
          color: #f1f5f9;
          margin-bottom: 6px;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .wqm-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 3px;
        }
        .wqm-label {
          color: #94a3b8;
          font-size: 11px;
        }
        .wqm-value {
          font-weight: 600;
          font-size: 12px;
        }
        .wqm-countdown {
          font-size: 18px;
          font-weight: 700;
          text-align: center;
          margin-top: 4px;
          font-variant-numeric: tabular-nums;
        }
        .wqm-countdown.likely { color: #4ade80; }
        .wqm-countdown.unlikely { color: #f87171; }
        .wqm-countdown.unknown { color: #facc15; }
        .wqm-countdown.imminent {
          animation: wqm-pulse 1s ease-in-out infinite;
        }
        @keyframes wqm-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .wqm-likelihood {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 1px 6px;
          border-radius: 4px;
        }
        .wqm-likelihood.likely { background: #14532d; color: #4ade80; }
        .wqm-likelihood.unlikely { background: #450a0a; color: #f87171; }
        .wqm-likelihood.unknown { background: #422006; color: #facc15; }
        .wqm-state {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 1px 6px;
          border-radius: 4px;
          background: #1e3a5f;
          color: #93c5fd;
        }
        .wqm-state.valid { background: #14532d; color: #4ade80; }
        .wqm-state.expired { background: #450a0a; color: #f87171; }
        #wqm-empty {
          color: #64748b;
          text-align: center;
          padding: 20px 10px;
          font-size: 12px;
        }
        #wqm-minimize {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          font-size: 16px;
          padding: 0 4px;
          pointer-events: auto;
        }
        #wqm-minimize:hover { color: #e2e8f0; }
      </style>
      <div id="wqm-panel">
        <div id="wqm-header">
          <span id="wqm-title">🛒 Queue Monitor</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="wqm-badge">0 items</span>
            <button id="wqm-minimize">─</button>
          </div>
        </div>
        <div id="wqm-items">
          <div id="wqm-empty">Waiting for queue data...<br>Queue info will appear automatically when detected.</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Minimize toggle
    let minimized = false;
    document.getElementById('wqm-minimize').addEventListener('click', () => {
      minimized = !minimized;
      document.getElementById('wqm-items').style.display = minimized ? 'none' : 'block';
      document.getElementById('wqm-minimize').textContent = minimized ? '□' : '─';
    });

    // Dragging
    const panel = document.getElementById('wqm-panel');
    let dragging = false, offsetX, offsetY;
    panel.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      const rect = overlay.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      overlay.style.left = (e.clientX - offsetX) + 'px';
      overlay.style.top = (e.clientY - offsetY) + 'px';
      overlay.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function renderItems() {
    const container = document.getElementById('wqm-items');
    const badge = document.getElementById('wqm-badge');
    if (!container) return;

    const items = Array.from(queueData.values());
    badge.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

    if (items.length === 0) {
      container.innerHTML = `<div id="wqm-empty">Waiting for queue data...</div>`;
      return;
    }

    // Sort: likely first, then by ETA
    items.sort((a, b) => {
      const la = a.customMetadata?.admissionLikelihood === 'likely' ? 0 : 1;
      const lb = b.customMetadata?.admissionLikelihood === 'likely' ? 0 : 1;
      if (la !== lb) return la - lb;
      return (a.expectedTurnTimeUnixTimestamp || 0) - (b.expectedTurnTimeUnixTimestamp || 0);
    });

    container.innerHTML = items.map(item => {
      const meta = item.customMetadata || {};
      const itemInfo = meta.item || {};
      const likelihood = meta.admissionLikelihood || 'unknown';
      const state = item.state || 'unknown';
      const price = itemInfo.currentPrice || '?';
      const name = itemInfo.name || `Item ${item.itemId}`;
      const shortName = name.length > 50 ? name.substring(0, 50) + '…' : name;

      return `
        <div class="wqm-item ${likelihood}" data-item-id="${item.itemId}">
          <div class="wqm-item-name" title="${name}">${shortName}</div>
          <div class="wqm-row">
            <span class="wqm-label">Price</span>
            <span class="wqm-value" style="color:#fbbf24">${price}</span>
          </div>
          <div class="wqm-row">
            <span class="wqm-label">Status</span>
            <span>
              <span class="wqm-state ${state}">${state}</span>
              <span class="wqm-likelihood ${likelihood}">${likelihood}</span>
            </span>
          </div>
          <div class="wqm-row">
            <span class="wqm-label">Ticket</span>
            <span class="wqm-value" style="color:#cbd5e1">#${item.ticket}</span>
          </div>
          <div class="wqm-countdown ${likelihood}" data-eta="${item.expectedTurnTimeUnixTimestamp || 0}">
            --:--
          </div>
        </div>
      `;
    }).join('');
  }

  function updateCountdowns() {
    const now = Date.now();
    document.querySelectorAll('.wqm-countdown').forEach(el => {
      const eta = parseInt(el.dataset.eta);
      if (!eta) { el.textContent = '--:--'; return; }

      const diff = eta - now;
      if (diff <= 0) {
        el.textContent = '🔔 YOUR TURN!';
        el.classList.add('imminent');
        return;
      }

      const totalSec = Math.floor(diff / 1000);
      const hrs = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      if (hrs > 0) {
        el.textContent = `${hrs}h ${mins}m ${secs}s`;
      } else if (mins > 0) {
        el.textContent = `${mins}m ${secs}s`;
      } else {
        el.textContent = `${secs}s`;
        el.classList.add('imminent');
      }

      // Remove imminent if > 60s
      if (totalSec > 60) el.classList.remove('imminent');
    });
  }

  // ── Data Interception ─────────────────────────────────────────────────────
  function processQueueData(data) {
    if (!Array.isArray(data)) return false;

    let found = false;
    for (const entry of data) {
      // Validate this looks like queue data
      if (entry.ticket !== undefined && entry.queue && entry.itemId) {
        queueData.set(entry.itemId, entry);
        found = true;
      }
    }

    if (found) {
      ensureOverlay();
      renderItems();
      console.log(`[Queue Monitor] Updated ${data.length} queue item(s)`);
    }
    return found;
  }

  function ensureOverlay() {
    if (!document.getElementById('wqm-overlay')) {
      if (document.body) {
        createOverlay();
      } else {
        document.addEventListener('DOMContentLoaded', createOverlay, { once: true });
      }
    }
  }

  // ── Interception Helpers ──────────────────────────────────────────────────
  // Check if a URL looks like it could be a queue API call
  function isQueueUrl(url) {
    if (!url) return false;
    return url.includes('q-api') ||
           url.includes('queue') ||
           url.includes('issueTicket') ||
           url.includes('checkTicket') ||
           url.includes('refreshTicket');
  }

  // Check if a parsed JSON object looks like queue data (shape-based detection)
  function looksLikeQueueData(data) {
    const arr = Array.isArray(data) ? data : [data];
    return arr.some(entry =>
      entry && typeof entry === 'object' &&
      'ticket' in entry &&
      'queue' in entry &&
      'state' in entry
    );
  }

  function tryProcessJson(data) {
    try {
      const arr = Array.isArray(data) ? data : [data];
      if (looksLikeQueueData(arr)) {
        processQueueData(arr);
      }
    } catch (e) { /* ignore */ }
  }

  // Hook fetch() — inspect ALL responses, filter by URL or shape
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    try {
      const clone = response.clone();
      if (isQueueUrl(url)) {
        // Likely queue API — always try to parse
        try {
          const json = await clone.json();
          tryProcessJson(json);
        } catch (e) { /* not JSON */ }
      } else {
        // Not an obvious queue URL — peek at content-type and check shape
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('json')) {
          try {
            const json = await clone.json();
            tryProcessJson(json);
          } catch (e) { /* ignore */ }
        }
      }
    } catch (e) { /* ignore clone errors */ }

    return response;
  };

  // Hook XMLHttpRequest — inspect all JSON responses
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._wqmUrl = url || '';
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const ct = this.getResponseHeader('content-type') || '';
        if (isQueueUrl(this._wqmUrl) || ct.includes('json')) {
          const json = JSON.parse(this.responseText);
          tryProcessJson(json);
        }
      } catch (e) { /* ignore */ }
    });
    return originalSend.apply(this, args);
  };

  // Hook Response.prototype.json as a catch-all fallback
  const originalResponseJson = Response.prototype.json;
  Response.prototype.json = async function () {
    const data = await originalResponseJson.call(this);
    tryProcessJson(data);
    return data;
  };

  // ── Countdown Timer ───────────────────────────────────────────────────────
  setInterval(updateCountdowns, 1000);

  // ── Init overlay on page load ─────────────────────────────────────────────
  if (document.body) {
    createOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', createOverlay, { once: true });
  }

  console.log('[Queue Monitor] Walmart Queue Monitor v1.0 loaded — watching for queue data...');
})();