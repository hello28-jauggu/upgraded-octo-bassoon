(() => {

  // —— Settings / Audio / Smooth ——
  const SK = "tankster_set_v5";
  let settings = Object.assign({
    volM: 70, volS: 80, volMu: 35, muteAll: false, gfx: "high"
  }, JSON.parse(localStorage.getItem(SK) || "{}"));
  function saveSet() { localStorage.setItem(SK, JSON.stringify(settings)); }

  let audioCtx = null, musicTimer = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }
  function tone(freq, dur, type, volScale) {
    if (settings.muteAll) return;
    try {
      ensureAudio();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type || "square";
      o.frequency.value = freq;
      const v = (settings.volM / 100) * (settings.volS / 100) * (volScale || 0.07);
      g.gain.value = v;
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }
  const SFX = {
    shoot: () => tone(240 + Math.random() * 40, 0.05, "square", 0.04),
    kill: () => { tone(480, 0.09, "square", 0.07); setTimeout(() => tone(620, 0.1, "square", 0.06), 70); },
    death: () => tone(100, 0.28, "sawtooth", 0.08),
    join: () => tone(320, 0.14, "triangle", 0.06),
    upgrade: () => tone(520, 0.09, "triangle", 0.06),
  };
  function startMusic() {
    stopMusic();
    if (settings.muteAll || settings.volMu <= 0) return;
    const notes = [196, 220, 247, 262, 294, 262, 247, 220];
    let i = 0;
    musicTimer = setInterval(() => {
      if (settings.muteAll) return;
      try {
        ensureAudio();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.value = notes[i++ % notes.length];
        const v = (settings.volM / 100) * (settings.volMu / 100) * 0.022;
        g.gain.value = v;
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.32);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + 0.32);
      } catch (e) {}
    }, 420);
  }
  function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; }

  const renderPos = new Map();
  function smooth(p) {
    let r = renderPos.get(p.id);
    if (!r) { r = { x: p.x, y: p.y, a: p.angle }; renderPos.set(p.id, r); }
    const k = 0.32;
    r.x += (p.x - r.x) * k;
    r.y += (p.y - r.y) * k;
    // angle lerp short path
    let da = p.angle - r.a;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    r.a += da * 0.4;
    return r;
  }

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const mini = document.getElementById("mini");
  const mctx = mini.getContext("2d");
  let WORLD = 5000;
  const keys = Object.create(null);
  const mouse = { x: 0, y: 0, down: false };
  const joy = { active: false, dx: 0, dy: 0 };
  let ws, myId, me, running = false, account = null;
  let players = [], bullets = [], shapes = [], drones = [], traps = [], walls = [], bases = [], dominators = [], tagged = null, teamScore = [], closer = 0;
  let classes = {}, tree = {};
  const isTouch = matchMedia("(pointer: coarse), (max-width: 900px)").matches;
  const $ = (id) => document.getElementById(id);

  function resize() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  addEventListener("resize", resize);
  resize();

  function connect() {
    const name = ($("name").value || "tank").trim().slice(0, 14);
    $("msg").textContent = "Connecting...";
    $("msg").style.color = "#070";
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onopen = () => ws.send(JSON.stringify({ t: "join", name, mode: ($("mode") && $("mode").value) || "ffa", account }));
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === "hello") {
        classes = msg.classes || {};
        tree = msg.tree || {};
        WORLD = msg.world || 5000;
      }
      if (msg.t === "joined") {
        myId = msg.id;
        if (msg.world) WORLD = msg.world;
        running = true;
        if (msg.mapName) {
          const el = $("maptxt");
          if (el) el.textContent = msg.mapName;
        }
        $("menu").classList.add("hidden");
        $("hud").classList.remove("hidden");
        if (isTouch) $("mobile").classList.remove("hidden");
        SFX.join();
        startMusic();
      }
      if (msg.t === "state") {
        players = msg.players || [];
        bullets = msg.bullets || [];
        shapes = msg.shapes || [];
        drones = msg.drones || [];
        traps = msg.traps || [];
        walls = msg.walls || [];
        bases = msg.bases || [];
        dominators = msg.dominators || [];
        tagged = msg.tagged || null;
        teamScore = msg.teamScore || [];
        closer = msg.closer || 0;
        if (msg.mapName) {
          const el = $("maptxt");
          if (el) el.textContent = msg.mapName + (closer > 0 ? " · CLOSING" : "");
        }
        me = players.find((p) => p.id === myId) || null;
        if (me) {
          if (me.lastDeath) {
            if ($("death").classList.contains("hidden")) SFX.death();
            $("death").classList.remove("hidden");
            $("dby").textContent = "by " + (me.lastDeath.killer || "?");
            $("dstats").innerHTML = "Score <b>" + me.lastDeath.score + "</b><br>Level <b>" + me.lastDeath.level + "</b><br>Class <b>" + (classes[me.lastDeath.classId]?.name || me.lastDeath.classId || "") + "</b>";
          } else {
            $("death").classList.add("hidden");
          }
          $("scoretxt").textContent = "Score: " + (me.score | 0);
          $("lvltxt").textContent = "Lvl " + me.level;
          const pct = Math.min(100, (me.level / 45) * 100);
          $("levelfill").style.width = pct + "%";
          renderUpgrades(me);
          renderClasses(me);
        }
        const box = $("lb");
        box.innerHTML = "<b>Leaderboard</b>";
        [...players].sort((a, b) => b.score - a.score).slice(0, 8).forEach((p, i) => {
          const d = document.createElement("div");
          d.innerHTML = `<span>${i + 1}. ${p.name}</span><span>${p.score}</span>`;
          box.appendChild(d);
        });
      }
      if (msg.t === "kill") SFX.kill();
      if (msg.t === "error") {
        $("msg").textContent = msg.error || "Error";
        $("msg").style.color = "#c00";
        $("menu").classList.remove("hidden");
        running = false;
      }
      if (msg.t === "chat") {
        const line = document.createElement("div");
        if (msg.sys) { line.className = "sys"; line.textContent = msg.text; }
        else line.textContent = (msg.name || "?") + ": " + msg.text;
        const clog = $("clog");
        if (clog) { clog.appendChild(line); clog.scrollTop = clog.scrollHeight; }
      }
      if (msg.t === "party") {
        const el = $("pInfo");
        if (el) el.textContent = msg.code + " · " + (msg.members || []).join(", ");
      }
      if (msg.t === "party_err") {
        const el = $("pInfo");
        if (el) el.textContent = msg.error || "Party error";
      }
    };
    ws.onclose = () => {
      $("msg").textContent = "Disconnected — npm start?";
      $("msg").style.color = "#c00";
      running = false;
    };
    ws.onerror = () => {
      $("msg").textContent = "Server offline";
      $("msg").style.color = "#c00";
    };
  }

  function renderUpgrades(p) {
    const el = $("upgrades");
    if (!p.up) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    el.innerHTML = "";
    const labels = {
      movement: "Movement Speed",
      reload: "Reload",
      bulletSpeed: "Bullet Speed",
      bulletDamage: "Bullet Damage",
      bodyDamage: "Body Damage",
      maxHealth: "Max Health",
    };
    Object.keys(labels).forEach((stat) => {
      const b = document.createElement("button");
      b.className = "ubtn";
      b.textContent = `${labels[stat]} (${p.stats[stat]})`;
      b.onclick = () => ws?.readyState === 1 && ws.send(JSON.stringify({ t: "upgrade", stat }));
      el.appendChild(b);
    });
  }

  function renderClasses(p) {
    const el = $("classes");
    const avail = [];
    Object.entries(tree).forEach(([lvl, list]) => {
      if (p.level >= +lvl) list.forEach((id) => { if (id !== p.classId) avail.push(id); });
    });
    if (!avail.length) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    el.innerHTML = "";
    avail.forEach((id) => {
      const b = document.createElement("button");
      b.className = "cbtn";
      b.textContent = classes[id]?.name || id;
      b.onclick = () => ws?.readyState === 1 && ws.send(JSON.stringify({ t: "class", id }));
      el.appendChild(b);
    });
  }

  function sendInput() {
    if (!ws || ws.readyState !== 1 || !me) return;
    let ix = 0, iy = 0;
    if (keys.KeyW || keys.ArrowUp) iy -= 1;
    if (keys.KeyS || keys.ArrowDown) iy += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (joy.active) { ix += joy.dx; iy += joy.dy; }
    const fov = me.fov || 1;
    const vw = innerWidth / fov, vh = innerHeight / fov;
    const angle = Math.atan2(
      me.y - vh / 2 + mouse.y / fov - me.y,
      me.x - vw / 2 + mouse.x / fov - me.x
    );
    ws.send(JSON.stringify({
      t: "input", ix, iy,
      shoot: mouse.down || !!keys.Space,
      angle,
    }));
  }

  function drawTank(x, y, angle, classId, color) {
    const cls = classes[classId] || { barrels: [0] };
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#999";
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 3;
    const barrels = cls.barrels || [0];
    if (barrels.length >= 4) {
      barrels.forEach((a) => {
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.rect(6, -5, 26, 10);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    } else if (barrels.length === 2 && Math.abs(Math.abs(barrels[0] - barrels[1]) - Math.PI) < 0.2) {
      ctx.beginPath();
      ctx.rect(6, -6, 28, 12);
      ctx.fill();
      ctx.stroke();
      ctx.rotate(Math.PI);
      ctx.beginPath();
      ctx.rect(6, -6, 28, 12);
      ctx.fill();
      ctx.stroke();
    } else if (barrels.length >= 2) {
      barrels.forEach((a, i) => {
        const yOff = barrels.length === 2 ? (i === 0 ? -8 : 8) : (i - 1) * 9;
        ctx.beginPath();
        ctx.rect(6, yOff - 5, 26, 10);
        ctx.fill();
        ctx.stroke();
      });
    } else {
      const long = (cls.bulletSpd || 1) > 1.2;
      ctx.beginPath();
      ctx.rect(6, long ? -4 : -6, long ? 36 : 28, long ? 8 : 12);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fillStyle = color || "#00b2e1";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!running) {
      ctx.fillStyle = "#8ecf5a";
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      return;
    }
    sendInput();
    let focus = me || { x: WORLD / 2, y: WORLD / 2, fov: 1 };
    if (me) { const sm = smooth(me); focus = { x: sm.x, y: sm.y, fov: me.fov || 1 }; }
    const fov = focus.fov || 1;
    const vw = innerWidth / fov, vh = innerHeight / fov;
    const camX = focus.x - vw / 2, camY = focus.y - vh / 2;

    ctx.save();
    ctx.scale(fov, fov);
    ctx.translate(-camX, -camY);

    ctx.fillStyle = "#8ecf5a";
    ctx.fillRect(camX - 50, camY - 50, vw + 100, vh + 100);

    // grid
    if (settings.gfx !== "low") {
      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      const gs = settings.gfx === "medium" ? 60 : 40;
      const x0 = Math.floor(camX / gs) * gs;
      const y0 = Math.floor(camY / gs) * gs;
      for (let x = x0; x < camX + vw; x += gs) {
        ctx.beginPath(); ctx.moveTo(x, camY); ctx.lineTo(x, camY + vh); ctx.stroke();
      }
      for (let y = y0; y < camY + vh; y += gs) {
        ctx.beginPath(); ctx.moveTo(camX, y); ctx.lineTo(camX + vw, y); ctx.stroke();
      }
    }

    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, WORLD, WORLD);
    // Arena closer visual
    if (closer > 0) {
      const m = closer * WORLD * 0.38;
      ctx.fillStyle = "rgba(200, 40, 40, 0.28)";
      ctx.fillRect(0, 0, WORLD, m);
      ctx.fillRect(0, WORLD - m, WORLD, m);
      ctx.fillRect(0, m, m, WORLD - 2 * m);
      ctx.fillRect(WORLD - m, m, m, WORLD - 2 * m);
      ctx.strokeStyle = "rgba(255, 80, 80, 0.7)";
      ctx.lineWidth = 4;
      ctx.strokeRect(m, m, WORLD - 2 * m, WORLD - 2 * m);
    }
    ctx.fillStyle = "rgba(80,80,80,0.85)";
    for (const w of walls) ctx.fillRect(w.x, w.y, w.w, w.h);
    for (const b of bases) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = (b.color || "#00b2e1") + "44";
      ctx.fill();
      ctx.strokeStyle = b.color || "#00b2e1";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    for (const d of dominators) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = d.color || "#999";
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 3;
      ctx.stroke();
    }


    for (const s of shapes) {
      ctx.beginPath();
      for (let i = 0; i < s.sides; i++) {
        const a = (s.angle || 0) + (i / s.sides) * Math.PI * 2 - Math.PI / 2;
        const px = s.x + Math.cos(a) * s.r;
        const py = s.y + Math.sin(a) * s.r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r || 5, 0, Math.PI * 2);
      ctx.fillStyle = b.color || "#00b2e1";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (const d of drones) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r || 11, 0, Math.PI * 2);
      ctx.fillStyle = d.color || "#00b2e1";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (const tr of traps) {
      ctx.beginPath();
      const spin = tr.spin || 0;
      for (let i = 0; i < 3; i++) {
        const a = spin - Math.PI / 2 + (i / 3) * Math.PI * 2;
        const px = tr.x + Math.cos(a) * (tr.r || 14);
        const py = tr.y + Math.sin(a) * (tr.r || 14);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = "#ffe869";
      ctx.globalAlpha = tr.armed > 0 ? 0.4 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#c4a000";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (const p of players) {
      if (p.alive === false) continue;
      const sm = smooth(p);
      drawTank(sm.x, sm.y, sm.a, p.classId, p.color);
      if (tagged && p.id === tagged) {
        ctx.beginPath(); ctx.arc(sm.x, sm.y, 32, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffe869"; ctx.lineWidth = 3; ctx.stroke();
      }
      // health
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(sm.x - 28, sm.y - 42, 56, 7);
      ctx.fillStyle = "#0f0";
      ctx.fillRect(sm.x - 28, sm.y - 42, 56 * (p.hp / (p.maxHp || 100)), 7);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Ubuntu, Arial";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 3;
      ctx.strokeText(p.name, sm.x, sm.y - 48);
      ctx.fillText(p.name, sm.x, sm.y - 48);
    }
    ctx.restore();

    // minimap
    mctx.clearRect(0, 0, 120, 120);
    mctx.fillStyle = "#7bbd4a";
    mctx.fillRect(0, 0, 120, 120);
    mctx.fillStyle = "#ffe869";
    for (const s of shapes) {
      mctx.fillRect((s.x / WORLD) * 120 - 1, (s.y / WORLD) * 120 - 1, 2, 2);
    }
    for (const p of players) {
      if (p.alive === false) continue;
      mctx.beginPath();
      mctx.arc((p.x / WORLD) * 120, (p.y / WORLD) * 120, 3, 0, Math.PI * 2);
      mctx.fillStyle = p.id === myId ? "#fff" : "#00b2e1";
      mctx.fill();
    }
  }

  function loop() {
    draw();
    requestAnimationFrame(loop);
  }

  addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  addEventListener("mousedown", () => { mouse.down = true; if (running) SFX.shoot(); });
  addEventListener("mouseup", () => { mouse.down = false; });

  const joyEl = $("joy"), knob = $("knob");
  function joyAt(x, y) {
    const r = joyEl.getBoundingClientRect();
    let dx = x - (r.left + r.width / 2);
    let dy = y - (r.top + r.height / 2);
    const max = 38, d = Math.hypot(dx, dy) || 1;
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    knob.style.left = 40 + dx + "px";
    knob.style.top = 40 + dy + "px";
    joy.active = true;
    joy.dx = dx / max;
    joy.dy = dy / max;
  }
  joyEl.addEventListener("touchstart", (e) => { e.preventDefault(); joyAt(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  joyEl.addEventListener("touchmove", (e) => { e.preventDefault(); joyAt(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  joyEl.addEventListener("touchend", () => {
    joy.active = false; joy.dx = 0; joy.dy = 0;
    knob.style.left = "40px"; knob.style.top = "40px";
  });
  $("fire").addEventListener("touchstart", (e) => { e.preventDefault(); mouse.down = true; }, { passive: false });
  $("fire").addEventListener("touchend", () => { mouse.down = false; });

  
  function openSettings() {
    $("volM").value = settings.volM;
    $("volS").value = settings.volS;
    $("volMu").value = settings.volMu;
    $("muteAll").checked = settings.muteAll;
    $("gfx").value = settings.gfx;
    $("settings").classList.remove("hidden");
  }
  $("btnSet")?.addEventListener("click", openSettings);
  $("btnSetMenu")?.addEventListener("click", openSettings);
  $("setClose")?.addEventListener("click", () => $("settings").classList.add("hidden"));
  $("setSave")?.addEventListener("click", () => {
    settings.volM = +$("volM").value;
    settings.volS = +$("volS").value;
    settings.volMu = +$("volMu").value;
    settings.muteAll = $("muteAll").checked;
    settings.gfx = $("gfx").value;
    saveSet();
    $("settings").classList.add("hidden");
    if (running) startMusic(); else stopMusic();
  });
  $("fire")?.addEventListener("touchstart", (e) => { e.preventDefault(); mouse.down = true; if (running) SFX.shoot(); }, { passive: false });

  
  async function api(path, body) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Failed");
    return j;
  }
  $("reg")?.addEventListener("click", async () => {
    try {
      const j = await api("/api/register", { name: $("name").value, pass: $("pass").value });
      account = j.name.toLowerCase();
      $("acct").textContent = "Registered: " + j.name;
      $("msg").textContent = "";
    } catch (e) { $("msg").textContent = e.message; }
  });
  $("login")?.addEventListener("click", async () => {
    try {
      const j = await api("/api/login", { name: $("name").value, pass: $("pass").value });
      account = j.name.toLowerCase();
      $("acct").textContent = "Hi " + j.name + " · best " + j.bestScore + " · " + j.kills + " kills";
      $("msg").textContent = "";
    } catch (e) { $("msg").textContent = e.message; }
  });
  $("cin")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && ws?.readyState === 1) {
      const text = $("cin").value.trim();
      if (text) { ws.send(JSON.stringify({ t: "chat", text })); $("cin").value = ""; }
    }
  });
  $("pCreate")?.addEventListener("click", () => {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ t: "party_create" }));
  });
  $("pJoin")?.addEventListener("click", () => {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ t: "party_join", code: $("pCode").value }));
  });
  fetch("/api/leaderboard").then((r) => r.json()).then((board) => {
    const el = $("glb");
    if (!el || !Array.isArray(board)) return;
    el.innerHTML = "<b>Leaderboard</b><br>" + board.slice(0, 8).map((u, i) => (i + 1) + ". " + u.name + " — " + u.bestScore).join("<br>");
  }).catch(() => {});
  fetch("/api/regions").then((r) => r.json()).then((regs) => {
    const el = $("regions");
    if (!el || !Array.isArray(regs)) return;
    el.innerHTML = "<b>Regions</b><br>" + regs.map((r) => {
      const mark = r.current ? " ← you" : (r.url ? "" : " (set host env)");
      return r.name + (r.online ? " ●" : " ○") + mark;
    }).join("<br>");
  }).catch(() => {});

  $("play").onclick = connect;

  loop();

})();
