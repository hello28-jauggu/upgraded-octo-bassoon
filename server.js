const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");
const { CLASSES, TREE } = require("./classes");
const { MAPS, ROTATION, generateDenseMaze } = require("./maps");
const fs = require("fs");
const DATA = path.join(__dirname, "data.json");
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DATA, "utf8")); }
  catch { return { users: {} }; }
}
function saveDB() {
  try { fs.writeFileSync(DATA, JSON.stringify(db, null, 2)); } catch (e) {}
}
const db = loadDB();
if (!db.bans) db.bans = {}; // key -> { reason, until, by }
if (!db.users) db.users = {};

// —— Anti-bot / rate limits ——
const rateLimit = new Map(); // ip -> { joins, chat, hits, t }
function clientIp(reqOrWs) {
  try {
    if (reqOrWs.headers) {
      const xf = reqOrWs.headers["x-forwarded-for"];
      if (xf) return String(xf).split(",")[0].trim();
      return reqOrWs.socket?.remoteAddress || "unknown";
    }
    if (reqOrWs._socket) return reqOrWs._socket.remoteAddress || "unknown";
  } catch (e) {}
  return "unknown";
}

function getRate(ip) {
  const now = Date.now();
  let r = rateLimit.get(ip);
  if (!r || now - r.t > 60000) {
    r = { joins: 0, chat: 0, hits: 0, t: now };
    rateLimit.set(ip, r);
  }
  return r;
}

function isBanned(key, ip) {
  const now = Date.now();
  for (const k of [key, ip].filter(Boolean)) {
    const b = db.bans[k];
    if (!b) continue;
    if (b.until && b.until < now) { delete db.bans[k]; saveDB(); continue; }
    return b;
  }
  return null;
}

function banKey(key, reason, hours, by) {
  const until = hours ? Date.now() + hours * 3600000 : 0; // 0 = permanent
  db.bans[key] = { reason: reason || "banned", until, by: by || "system", at: Date.now() };
  saveDB();
}

const ADMIN_KEY = process.env.ADMIN_KEY || "tankster-admin-change-me";


// Region metadata (single process = one region; scale by running multiple hosts)
const REGION = process.env.REGION || "local";
const REGIONS = [
  { id: "local", name: "Local / Codespace", host: null },
  { id: "us", name: "US East", host: process.env.REGION_US || null },
  { id: "eu", name: "Europe", host: process.env.REGION_EU || null },
  { id: "asia", name: "Asia", host: process.env.REGION_ASIA || null },
];


const PORT = process.env.PORT || 3000;
const TICK = 50;
const TEAM_COLORS = ["#00b2e1", "#f14e54", "#00e16e", "#ffe869"];

const MODES = {
  ffa: { name: "FFA", teams: 0, dom: false, tag: false, sandbox: false, closer: true, mapRot: true },
  tdm2: { name: "2 Teams", teams: 2, bases: true, closer: false, mapRot: true },
  tdm4: { name: "4 Teams", teams: 4, bases: true, closer: false, mapRot: true },
  domination: { name: "Domination", teams: 2, dom: true, bases: true, closer: false, fixedMap: "rings" },
  tag: { name: "Tag", teams: 0, tag: true, closer: true, fixedMap: "cross" },
  maze: { name: "Maze", teams: 0, closer: true, fixedMap: "maze_dense" },
  sandbox: { name: "Sandbox", teams: 0, sandbox: true, closer: false, fixedMap: "open" },
  corridors: { name: "Corridors", teams: 0, closer: true, fixedMap: "corridors" },
  boxes: { name: "Boxes", teams: 0, closer: true, fixedMap: "boxes" },
};

function uid() { return Math.random().toString(36).slice(2, 9); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function makeMaze(world) {
  const walls = [];
  const cell = 320;
  for (let x = 250; x < world - 250; x += cell) {
    for (let y = 250; y < world - 250; y += cell) {
      if (Math.random() < 0.4) {
        const h = Math.random() < 0.5;
        walls.push({ x, y, w: h ? cell * 0.8 : 28, h: h ? 28 : cell * 0.8 });
      }
    }
  }
  return walls;
}

class Room {
  constructor(modeId) {
    this.modeId = modeId;
    this.mode = MODES[modeId] || MODES.ffa;
    this.mapId = this.mode.fixedMap || ROTATION[(Math.random() * ROTATION.length) | 0];
    this.map = MAPS[this.mapId] || MAPS.open;
    this.world = this.map.world || 5000;
    this.clients = new Map();
    this.bullets = [];
    this.drones = [];
    this.traps = [];
    this.shapes = [];
    if (this.mapId === "maze_dense" || (this.map.walls === null)) {
      this.walls = generateDenseMaze(this.world);
    } else {
      this.walls = (this.map.walls || []).map((w) => ({ ...w }));
    }
    this.bases = [];
    this.dominators = [];
    this.teamCount = [0, 0, 0, 0];
    this.teamScore = [0, 0, 0, 0];
    this.tagged = null;
    this.startedAt = Date.now();
    this.closer = 0; // 0..1 shrink from edges
    this.spawnShapes(this.mode.sandbox ? 40 : 80);
    if (this.mode.bases) this.spawnBases();
    if (this.mode.dom) this.spawnDominators();
  }

  spawnBases() {
    const n = this.mode.teams || 2;
    const pos = n === 4
      ? [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]
      : [[0.1, 0.5], [0.9, 0.5]];
    this.bases = pos.slice(0, n).map((p, i) => ({
      team: i, x: this.world * p[0], y: this.world * p[1], r: 130, color: TEAM_COLORS[i],
    }));
  }

  spawnDominators() {
    const spots = [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]];
    this.dominators = spots.map((s, i) => ({
      id: "dom" + i, x: this.world * s[0], y: this.world * s[1],
      r: 55, team: -1, capture: 0, color: "#999", reload: 0,
    }));
  }

  spawnShapes(n) {
    const types = [
      { sides: 4, r: 20, hp: 30, score: 10, color: "#ffe869" },
      { sides: 3, r: 18, hp: 50, score: 25, color: "#fc7677" },
      { sides: 5, r: 30, hp: 130, score: 100, color: "#768dfc" },
    ];
    for (let i = 0; i < n; i++) {
      const t = types[(Math.random() * types.length) | 0];
      this.shapes.push({
        id: uid(), x: 120 + Math.random() * (this.world - 240), y: 120 + Math.random() * (this.world - 240),
        angle: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.02, maxHp: t.hp, ...t,
      });
    }
  }

  wallBlock(x, y, r) {
    for (const w of this.walls) {
      const cx = clamp(x, w.x, w.x + w.w), cy = clamp(y, w.y, w.y + w.h);
      if (Math.hypot(x - cx, y - cy) < r) return true;
    }
    if (this.mode.closer && this.closer > 0) {
      const m = this.closer * this.world * 0.38;
      if (x < m + r || y < m + r || x > this.world - m - r || y > this.world - m - r) return true;
    }
    return false;
  }

  pickTeam() {
    const n = this.mode.teams || 0;
    if (!n) return 0;
    let best = 0;
    for (let i = 1; i < n; i++) if (this.teamCount[i] < this.teamCount[best]) best = i;
    return best;
  }

  add(ws, name, account) {
    const team = this.pickTeam();
    if (this.mode.teams) this.teamCount[team]++;
    let x = this.world / 2 + (Math.random() - 0.5) * 600;
    let y = this.world / 2 + (Math.random() - 0.5) * 600;
    if (this.bases[team]) {
      x = this.bases[team].x + (Math.random() - 0.5) * 80;
      y = this.bases[team].y + (Math.random() - 0.5) * 80;
    }
    const p = {
      id: uid(), name: String(name || "unnamed").slice(0, 14), account: account || null,
      x, y, vx: 0, vy: 0, angle: 0, r: 24, hp: 100, maxHp: 100,
      score: 0, level: 1, xp: 0, xpNeed: 20, up: 0, classId: "basic",
      team, color: this.mode.teams ? TEAM_COLORS[team] : "#00b2e1",
      stats: { movement: 1, reload: 1, bulletSpeed: 1, bulletDamage: 1, bodyDamage: 1, maxHealth: 1 },
      reload: 0, alive: true, input: { ix: 0, iy: 0, shoot: false, angle: 0 }, lastDeath: null, kills: 0, deaths: 0,
    };
    if (this.mode.sandbox) { p.level = 60; p.up = 40; p.score = 5000; }
    if (this.mode.tag && !this.tagged) this.tagged = p.id;
    this.clients.set(ws, p);
    return p;
  }

  remove(ws) {
    const p = this.clients.get(ws);
    if (p && this.mode.teams) this.teamCount[p.team] = Math.max(0, this.teamCount[p.team] - 1);
    if (p) {
      if (p.account && db.users[p.account]) {
        const u = db.users[p.account];
        u.bestScore = Math.max(u.bestScore || 0, p.score);
        u.kills = (u.kills || 0) + (p.kills || 0);
        u.deaths = (u.deaths || 0) + (p.deaths || 0);
        u.games = (u.games || 0) + 1;
        u.history = u.history || [];
        u.history.push({ score: p.score, level: p.level, classId: p.classId, mode: this.modeId, at: Date.now() });
        if (u.history.length > 20) u.history = u.history.slice(-20);
        saveDB();
      }
      this.drones = this.drones.filter((d) => d.owner !== p.id);
      this.traps = this.traps.filter((t) => t.owner !== p.id);
      if (this.tagged === p.id) this.tagged = null;
    }
    this.clients.delete(ws);
  }

  broadcast(obj, except) {
    const raw = JSON.stringify(obj);
    for (const [c] of this.clients) if (c !== except && c.readyState === 1) c.send(raw);
  }

  grant(p, n) {
    p.score += n; p.xp += n;
    if (this.mode.teams) this.teamScore[p.team] = (this.teamScore[p.team] || 0) + n * 0.1;
    while (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed; p.level++; p.up++;
      p.xpNeed = Math.floor(20 + p.level * 12);
      p.maxHp = 100 + p.level * 8 + p.stats.maxHealth * 15;
      p.hp = Math.min(p.maxHp, p.hp + 20);
    }
  }

  fire(p) {
    const cls = CLASSES[p.classId] || CLASSES.basic;
    const skill = cls.skill || "bullet";
    if (skill === "smash") return;
    p.reload = (cls.reload || 14) / (0.7 + p.stats.reload * 0.3);
    if (skill === "drone") {
      const max = cls.drones || 4;
      if (this.drones.filter((d) => d.owner === p.id).length >= max) return;
      const a = p.angle + (Math.random() - 0.5) * 0.4;
      this.drones.push({
        id: uid(), owner: p.id, team: p.team,
        x: p.x + Math.cos(a) * 32, y: p.y + Math.sin(a) * 32,
        vx: 0, vy: 0, r: 11, dmg: 7 * (0.7 + p.stats.bulletDamage * 0.3),
        color: p.color, life: 800, orbit: Math.random() * Math.PI * 2,
      });
      return;
    }
    if (skill === "trap") {
      if (this.traps.filter((t) => t.owner === p.id).length >= 8) return;
      this.traps.push({
        id: uid(), owner: p.id, team: p.team,
        x: p.x + Math.cos(p.angle) * 36, y: p.y + Math.sin(p.angle) * 36,
        r: 14, hp: 90, dmg: 14 * (0.7 + p.stats.bulletDamage * 0.3),
        color: "#ffe869", life: 450, armed: 12, spin: 0,
      });
      return;
    }
    const spd = 7.2 * (0.7 + p.stats.bulletSpeed * 0.3) * (cls.bulletSpd || 1);
    const dmg = 10 * (0.7 + p.stats.bulletDamage * 0.3) * (cls.bulletDmg || 1);
    const recoil = cls.recoil || 0.35;
    p.vx -= Math.cos(p.angle) * recoil * (0.5 + dmg / 40);
    p.vy -= Math.sin(p.angle) * recoil * (0.5 + dmg / 40);
    for (const off of cls.barrels || [0]) {
      const spread = cls.spread ? (Math.random() - 0.5) * cls.spread : 0;
      const a = p.angle + off + spread;
      const s = spd * (0.97 + Math.random() * 0.06);
      this.bullets.push({
        id: uid(), owner: p.id, team: p.team,
        x: p.x + Math.cos(a) * (p.r + 8), y: p.y + Math.sin(a) * (p.r + 8),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: cls.bulletR || 5, life: cls.bulletLife || 55, dmg, color: p.color,
      });
    }
  }

  killPlayer(p, ownerId, players) {
    p.alive = false;
    p.deaths = (p.deaths || 0) + 1;
    const killer = players.find((x) => x.id === ownerId);
    if (killer) killer.kills = (killer.kills || 0) + 1;
    p.lastDeath = {
      killer: killer ? killer.name : (ownerId ? "?" : "Zone"),
      score: p.score, level: p.level, classId: p.classId,
    };
    if (killer) this.grant(killer, 30 + Math.floor(p.score * 0.1));
    if (this.mode.tag) this.tagged = ownerId || p.id;
    this.broadcast({ t: "kill", killer: p.lastDeath.killer, victim: p.name });
    this.drones = this.drones.filter((d) => d.owner !== p.id);
    const id = p.id;
    setTimeout(() => {
      if (p.id !== id) return;
      p.alive = true; p.hp = p.maxHp;
      if (this.bases[p.team] && this.mode.teams) {
        p.x = this.bases[p.team].x; p.y = this.bases[p.team].y;
      } else {
        p.x = this.world / 2 + (Math.random() - 0.5) * 800;
        p.y = this.world / 2 + (Math.random() - 0.5) * 800;
      }
      p.score = Math.floor(p.score * 0.5);
      p.lastDeath = null;
    }, 1500);
  }

  tick() {
    const players = [...this.clients.values()];
    const W = this.world;
    // Arena closer / border shrink (after 6 min)
    if (this.mode.closer) {
      const elapsed = (Date.now() - this.startedAt) / 1000;
      if (elapsed > 360) this.closer = Math.min(0.48, (elapsed - 360) / 480);
      // damage players outside safe zone
      if (this.closer > 0) {
        const m = this.closer * W * 0.38;
        for (const p of players) {
          if (!p.alive) continue;
          if (p.x < m || p.y < m || p.x > W - m || p.y > W - m) p.hp -= 0.4;
          if (p.hp <= 0) this.killPlayer(p, null, players);
        }
      }
    }

    for (const p of players) {
      if (!p.alive) continue;
      const { ix, iy, shoot, angle } = p.input;
      const cls = CLASSES[p.classId] || CLASSES.basic;
      const len = Math.hypot(ix, iy) || 1;
      const acc = 0.55 * (0.7 + p.stats.movement * 0.3) * (cls.speedMul || 1);
      p.vx += (ix / len) * acc; p.vy += (iy / len) * acc;
      p.vx *= 0.88; p.vy *= 0.88;
      let nx = clamp(p.x + p.vx, p.r, W - p.r);
      let ny = clamp(p.y + p.vy, p.r, W - p.r);
      if (this.wallBlock(nx, p.y, p.r)) { nx = p.x; p.vx = 0; }
      if (this.wallBlock(nx, ny, p.r)) { ny = p.y; p.vy = 0; }
      p.x = nx; p.y = ny; p.angle = angle;
      if (p.reload > 0) p.reload--;
      if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 0.04);

      // base regen for own team
      for (const b of this.bases) {
        if (b.team === p.team && Math.hypot(p.x - b.x, p.y - b.y) < b.r) {
          p.hp = Math.min(p.maxHp, p.hp + 0.35);
        }
      }

      if (cls.skill === "smash") {
        for (const o of players) {
          if (!o.alive || o.id === p.id) continue;
          if (this.mode.teams && o.team === p.team) continue;
          if (Math.hypot(p.x - o.x, p.y - o.y) < p.r + o.r) {
            o.hp -= 1.1 * p.stats.bodyDamage * (cls.bodyMeta || 1);
            p.hp -= 0.2;
            if (o.hp <= 0) this.killPlayer(o, p.id, players);
          }
        }
      }

      if ((cls.skill === "auto" || cls.auto) && Math.random() < 0.12) {
        let nearest = null, nd = 320;
        for (const o of players) {
          if (!o.alive || o.id === p.id) continue;
          if (this.mode.teams && o.team === p.team) continue;
          const d = Math.hypot(o.x - p.x, o.y - p.y);
          if (d < nd) { nd = d; nearest = o; }
        }
        if (nearest) {
          const a = Math.atan2(nearest.y - p.y, nearest.x - p.x);
          this.bullets.push({
            id: uid(), owner: p.id, team: p.team,
            x: p.x + Math.cos(a) * 28, y: p.y + Math.sin(a) * 28,
            vx: Math.cos(a) * 7, vy: Math.sin(a) * 7,
            r: 3.5, life: 40, dmg: 5 * (0.7 + p.stats.bulletDamage * 0.3), color: p.color,
          });
        }
      }
      if (shoot && p.reload <= 0) this.fire(p);
    }

    // dominators
    for (const dom of this.dominators) {
      let near = null, cnt = 0;
      for (const p of players) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - dom.x, p.y - dom.y) < dom.r + 45) {
          if (near === null) near = p.team;
          if (p.team === near) cnt++; else cnt--;
        }
      }
      if (cnt > 0 && near !== null) {
        if (dom.team === near) dom.capture = Math.min(100, dom.capture + 0.5);
        else { dom.capture -= 0.6; if (dom.capture <= 0) { dom.team = near; dom.capture = 15; } }
      }
      dom.color = dom.team >= 0 ? TEAM_COLORS[dom.team] : "#999";
      if (dom.team >= 0) {
        this.teamScore[dom.team] = (this.teamScore[dom.team] || 0) + 0.2;
        dom.reload--;
        if (dom.reload <= 0) {
          const enemies = players.filter((p) => p.alive && p.team !== dom.team);
          if (enemies.length) {
            const t = enemies[(Math.random() * enemies.length) | 0];
            const a = Math.atan2(t.y - dom.y, t.x - dom.x);
            dom.reload = 14;
            this.bullets.push({
              id: uid(), owner: "dom", team: dom.team,
              x: dom.x, y: dom.y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6,
              r: 6, life: 50, dmg: 14, color: dom.color,
            });
          }
        }
      }
    }

    for (const d of this.drones) {
      const owner = players.find((p) => p.id === d.owner);
      if (!owner || !owner.alive) { d.life = 0; continue; }
      let target = null, best = 280;
      for (const o of players) {
        if (!o.alive || o.id === d.owner) continue;
        if (this.mode.teams && o.team === d.team) continue;
        const dist = Math.hypot(o.x - d.x, o.y - d.y);
        if (dist < best) { best = dist; target = o; }
      }
      let gx, gy, spd = 5.2;
      if (target) { gx = target.x; gy = target.y; spd = 6.3; }
      else if (owner.input.shoot) {
        gx = owner.x + Math.cos(owner.angle) * 220;
        gy = owner.y + Math.sin(owner.angle) * 220; spd = 6;
      } else {
        d.orbit = (d.orbit || 0) + 0.09;
        gx = owner.x + Math.cos(d.orbit) * 95;
        gy = owner.y + Math.sin(d.orbit) * 95;
      }
      const a = Math.atan2(gy - d.y, gx - d.x);
      d.vx = (d.vx || 0) * 0.65 + Math.cos(a) * spd * 0.35;
      d.vy = (d.vy || 0) * 0.65 + Math.sin(a) * spd * 0.35;
      d.x += d.vx; d.y += d.vy; d.life--;
      if (target && best < d.r + 24) {
        target.hp -= d.dmg * 0.1;
        if (target.hp <= 0) this.killPlayer(target, d.owner, players);
      }
    }
    this.drones = this.drones.filter((d) => d.life > 0);

    for (const tr of this.traps) {
      tr.life--; if (tr.armed > 0) tr.armed--; tr.spin += 0.06;
      if (tr.armed > 0) continue;
      for (const o of players) {
        if (!o.alive || o.id === tr.owner) continue;
        if (this.mode.teams && o.team === tr.team) continue;
        if (Math.hypot(o.x - tr.x, o.y - tr.y) < o.r + tr.r) {
          o.hp -= tr.dmg * 0.12; tr.hp -= 8;
          if (o.hp <= 0) this.killPlayer(o, tr.owner, players);
        }
      }
    }
    this.traps = this.traps.filter((t) => t.life > 0 && t.hp > 0);

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx; b.y += b.vy; b.vx *= 0.999; b.vy *= 0.999; b.life--;
      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > W || b.y > W || this.wallBlock(b.x, b.y, b.r)) {
        this.bullets.splice(i, 1); continue;
      }
      let hit = false;
      for (let j = this.shapes.length - 1; j >= 0; j--) {
        const s = this.shapes[j];
        if (Math.hypot(b.x - s.x, b.y - s.y) < b.r + s.r) {
          s.hp -= b.dmg; this.bullets.splice(i, 1); hit = true;
          if (s.hp <= 0) {
            const owner = players.find((x) => x.id === b.owner);
            if (owner) this.grant(owner, s.score);
            this.shapes.splice(j, 1); this.spawnShapes(1);
          }
          break;
        }
      }
      if (hit) continue;
      for (const p of players) {
        if (!p.alive || p.id === b.owner) continue;
        if (this.mode.teams && b.team === p.team && b.owner !== "dom") continue;
        if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r) {
          p.hp -= b.dmg / Math.max(1, p.stats.bodyDamage * 0.4);
          p.vx += b.vx * 0.025; p.vy += b.vy * 0.025;
          this.bullets.splice(i, 1);
          if (p.hp <= 0) this.killPlayer(p, b.owner, players);
          break;
        }
      }
    }
    for (const s of this.shapes) s.angle += s.spin;

    this.broadcast({
      t: "state", mode: this.modeId,
      teamScore: this.teamScore, tagged: this.tagged,
      closer: this.closer, mapId: this.mapId, mapName: this.map.name,
      players: players.map((p) => ({
        id: p.id, name: p.name, x: p.x, y: p.y, angle: p.angle,
        hp: p.hp, maxHp: p.maxHp, score: p.score, level: p.level, up: p.up,
        classId: p.classId, stats: p.stats, alive: p.alive, team: p.team, color: p.color,
        fov: (CLASSES[p.classId] || {}).fov || 1, skill: (CLASSES[p.classId] || {}).skill || "bullet",
        lastDeath: p.lastDeath,
      })),
      bullets: this.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, r: b.r, color: b.color })),
      drones: this.drones.map((d) => ({ id: d.id, x: d.x, y: d.y, r: d.r, color: d.color })),
      traps: this.traps.map((tr) => ({ id: tr.id, x: tr.x, y: tr.y, r: tr.r, spin: tr.spin, armed: tr.armed })),
      shapes: this.shapes.map((s) => ({ id: s.id, x: s.x, y: s.y, r: s.r, sides: s.sides, angle: s.angle, color: s.color })),
      walls: this.walls, bases: this.bases, dominators: this.dominators,
    });
  }
}

const app = express();
app.use(express.json({ limit: "12kb" }));
app.use(express.static(path.join(__dirname, "client")));

app.post("/api/register", (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 14);
  const pass = String(req.body.pass || "").slice(0, 64);
  if (name.length < 2 || pass.length < 3) return res.status(400).json({ error: "Short name/pass" });
  const key = name.toLowerCase();
  if (db.users[key]) return res.status(400).json({ error: "Name taken" });
  db.users[key] = { name, pass, bestScore: 0, kills: 0, deaths: 0, games: 0, history: [], created: Date.now() };
  saveDB();
  res.json({ ok: true, name });
});

app.post("/api/login", (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 14);
  const pass = String(req.body.pass || "").slice(0, 64);
  const u = db.users[name.toLowerCase()];
  if (!u || u.pass !== pass) return res.status(401).json({ error: "Invalid login" });
  res.json({
    ok: true, name: u.name, bestScore: u.bestScore || 0, kills: u.kills || 0,
    deaths: u.deaths || 0, games: u.games || 0, history: (u.history || []).slice(-10),
  });
});

app.get("/api/leaderboard", (_req, res) => {
  const board = Object.values(db.users)
    .map((u) => ({ name: u.name, bestScore: u.bestScore || 0, kills: u.kills || 0, games: u.games || 0 }))
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, 30);
  res.json(board);
});

app.post("/api/admin/ban", (req, res) => {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) return res.status(403).json({ error: "Forbidden" });
  const key = String(req.body.key || "").toLowerCase();
  if (!key) return res.status(400).json({ error: "key required" });
  banKey(key, req.body.reason || "banned", req.body.hours || 0, "admin");
  // kick if online
  for (const room of Object.values(rooms)) {
    for (const [c, pl] of room.clients) {
      if ((pl.account && pl.account === key) || pl.name.toLowerCase() === key) {
        c.send(JSON.stringify({ t: "error", error: "You were banned" }));
        c.close();
      }
    }
  }
  res.json({ ok: true, bans: Object.keys(db.bans).length });
});

app.post("/api/admin/unban", (req, res) => {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) return res.status(403).json({ error: "Forbidden" });
  const key = String(req.body.key || "").toLowerCase();
  delete db.bans[key];
  saveDB();
  res.json({ ok: true });
});

app.get("/api/admin/bans", (req, res) => {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) return res.status(403).json({ error: "Forbidden" });
  res.json(db.bans);
});

app.get("/api/regions", (_req, res) => {
  res.json(REGIONS.map((r) => ({
    id: r.id, name: r.name, online: r.id === REGION || !!r.host,
    url: r.host || null, current: r.id === REGION,
  })));
});

app.get("/health", (_req, res) => res.json({ ok: true, modes: Object.keys(MODES) }));
app.get("/api/modes", (_req, res) => {
  res.json(Object.entries(MODES).map(([id, m]) => ({
    id, name: m.name, players: rooms[id] ? rooms[id].clients.size : 0,
  })));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const rooms = Object.fromEntries(Object.keys(MODES).map((id) => [id, new Room(id)]));
const parties = new Map(); // code -> { leader, members: Set names, mode }

function partyCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}


wss.on("connection", (ws, req) => {
  let player = null, room = null;
  const ip = clientIp(req || ws);
  ws._ip = ip;

  const banned = isBanned(null, ip);
  if (banned) {
    ws.send(JSON.stringify({ t: "error", error: "Banned: " + (banned.reason || "") }));
    ws.close();
    return;
  }

  ws.send(JSON.stringify({
    t: "hello",
    classes: Object.fromEntries(Object.entries(CLASSES).map(([k, v]) => [k, { name: v.name, color: v.color, fov: v.fov, skill: v.skill, barrels: v.barrels }])),
    tree: TREE, modes: Object.entries(MODES).map(([id, m]) => ({ id, name: m.name })), world: 5000, region: REGION,
  }));
  ws.on("message", (buf) => {
    let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }
    if (msg.t === "join") {
      const name = String(msg.name || "unnamed").slice(0, 14);
      const acc = msg.account ? String(msg.account).toLowerCase() : null;
      const ban = isBanned(acc || name.toLowerCase(), ws._ip);
      if (ban) {
        ws.send(JSON.stringify({ t: "error", error: "Banned: " + (ban.reason || "access denied") }));
        return;
      }
      // rate limit joins
      const rl = getRate(ws._ip);
      rl.joins++;
      if (rl.joins > 12) {
        ws.send(JSON.stringify({ t: "error", error: "Too many joins — wait a minute" }));
        return;
      }
      const modeId = MODES[msg.mode] ? msg.mode : "ffa";
      room = rooms[modeId];
      player = room.add(ws, name, acc);
      ws.send(JSON.stringify({ t: "joined", id: player.id, world: room.world, mode: modeId, team: player.team, mapId: room.mapId, mapName: room.map.name }));
      room.broadcast({ t: "chat", sys: true, text: player.name + " joined" }, ws);
      return;
    }
    if (!player || !room) return;
    if (msg.t === "input") {
      player._inCount = (player._inCount || 0) + 1;
      if (!player._inReset || Date.now() > player._inReset) {
        if (player._inCount > 80) {
          // suspicious input flood
          getRate(ws._ip).hits++;
        }
        player._inCount = 0;
        player._inReset = Date.now() + 1000;
      }
      player.input.ix = clamp(+msg.ix || 0, -1, 1);
      player.input.iy = clamp(+msg.iy || 0, -1, 1);
      player.input.shoot = !!msg.shoot;
      player.input.angle = +msg.angle || 0;
    }
    if (msg.t === "upgrade" && player.up > 0 && player.stats[msg.stat] != null) {
      player.stats[msg.stat]++; player.up--;
      if (msg.stat === "maxHealth") {
        player.maxHp = 100 + player.level * 8 + player.stats.maxHealth * 15;
        player.hp = Math.min(player.maxHp, player.hp + 15);
      }
    }
    if (msg.t === "chat") {
      const rl = getRate(ws._ip);
      rl.chat++;
      if (rl.chat > 25) {
        ws.send(JSON.stringify({ t: "chat", sys: true, text: "Chat rate limited" }));
        return;
      }
      let text = String(msg.text || "").slice(0, 80);
      // basic spam filter
      if (/(.)\1{6,}/.test(text) || text.split(" ").length > 40) return;
      if (text) room.broadcast({ t: "chat", name: player.name, text, team: player.team });
    }
    if (msg.t === "party_create") {
      const code = partyCode();
      parties.set(code, { leader: player.name, members: new Set([player.name]), mode: room.modeId });
      player.party = code;
      ws.send(JSON.stringify({ t: "party", code, members: [player.name] }));
    }
    if (msg.t === "party_join") {
      const code = String(msg.code || "").toUpperCase();
      const pty = parties.get(code);
      if (!pty) { ws.send(JSON.stringify({ t: "party_err", error: "Invalid code" })); }
      else {
        pty.members.add(player.name);
        player.party = code;
        const members = [...pty.members];
        for (const [c, pl] of room.clients) {
          if (pl.party === code && c.readyState === 1)
            c.send(JSON.stringify({ t: "party", code, members }));
        }
      }
    }
    if (msg.t === "class" && CLASSES[msg.id]) {
      const need = Object.entries(TREE).find(([, list]) => list.includes(msg.id));
      if ((room.mode.sandbox || (need && player.level >= +need[0]))) {
        player.classId = msg.id;
        if (!room.mode.teams) player.color = "#00b2e1";
        room.drones = room.drones.filter((d) => d.owner !== player.id);
      }
    }
  });
  ws.on("close", () => { if (player && room) room.remove(ws); });
});

setInterval(() => { for (const r of Object.values(rooms)) if (r.clients.size) r.tick(); }, TICK);
server.listen(PORT, "0.0.0.0", () => console.log("Tankster.io v3 modes → :" + PORT));
