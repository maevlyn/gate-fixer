/* gates3d.js: shared three.js (r128, global THREE) kit for the logic-gate game prototypes.
   Builds extruded IEEE-style gate symbols, slide switches, lamps and wires, evaluates the
   circuit, and animates signals travelling stage by stage through it. */
(function () {
  const T = THREE;
  const S = 0.9; // gate scale in world units

  const COL = {
    bg: 0x081214, board: 0x0a1719, grid: 0x14302f,
    gate: 0xe3e8df, on: 0xffb02e, off: 0x2b4749, unknown: 0x46525b,
    slot: 0x6fd3c8, zeroHead: 0x8fd0ff
  };

  const FN = {
    AND: (a, b) => a & b,
    OR: (a, b) => a | b,
    NOT: (a) => 1 - a,
    NAND: (a, b) => 1 - (a & b),
    NOR: (a, b) => 1 - (a | b),
    XOR: (a, b) => a ^ b,
    XNOR: (a, b) => 1 - (a ^ b)
  };
  const GATES = ['NOT', 'AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'];
  const RULE = {
    AND: 'outputs 1 only when every input is 1',
    OR: 'outputs 1 when at least one input is 1',
    NOT: 'flips its input: 1 becomes 0, 0 becomes 1',
    NAND: 'outputs 0 only when every input is 1 (NOT AND)',
    NOR: 'outputs 1 only when every input is 0 (NOT OR)',
    XOR: 'outputs 1 when the inputs are different',
    XNOR: 'outputs 1 when the inputs are the same'
  };
  const SYM = { AND: 'A·B', OR: 'A+B', NOT: 'Ā', NAND: '¬(A·B)', NOR: '¬(A+B)', XOR: 'A⊕B', XNOR: '¬(A⊕B)' };
  const BASE = { AND: 'AND', NAND: 'AND', OR: 'OR', NOR: 'OR', XOR: 'XOR', XNOR: 'XOR', NOT: 'NOT' };
  const INV = { NAND: 1, NOR: 1, XNOR: 1, NOT: 1 };

  const V = (x, y, z = 0) => new T.Vector3(x, y, z);
  const apply = (t, a) => (t === 'NOT' ? FN.NOT(a[0]) : FN[t](a[0], a[1]));

  // ---------- text on canvas textures
  const texCache = {};
  function textTexture(txt, color, px) {
    const key = txt + '|' + color + '|' + px;
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = color; g.font = `600 ${px}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 128, 68);
    const t = new T.CanvasTexture(c); t.anisotropy = 4;
    return (texCache[key] = t);
  }
  function label(txt, w, color, px = 64) {
    const m = new T.Mesh(new T.PlaneGeometry(w, w / 2),
      new T.MeshBasicMaterial({ map: textTexture(txt, color, px), transparent: true, depthWrite: false }));
    m.userData.set = (s, c = color) => { m.material.map = textTexture(s, c, px); m.material.needsUpdate = true; };
    return m;
  }

  // ---------- gate symbol geometry (local units: body spans x -1..0.8, y -0.8..0.8)
  function bodyShapes(type) {
    const b = BASE[type], out = [];
    if (b === 'AND') {
      const p = new T.Shape();
      p.moveTo(-1, -0.8); p.lineTo(0, -0.8); p.absarc(0, 0, 0.8, -Math.PI / 2, Math.PI / 2, false);
      p.lineTo(-1, 0.8); p.closePath(); out.push(p);
    } else if (b === 'OR' || b === 'XOR') {
      const p = new T.Shape();
      p.moveTo(-1, 0.8); p.quadraticCurveTo(0.25, 0.8, 0.8, 0); p.quadraticCurveTo(0.25, -0.8, -1, -0.8);
      p.quadraticCurveTo(-0.6, 0, -1, 0.8); out.push(p);
      if (b === 'XOR') {
        const q = new T.Shape();
        q.moveTo(-1.22, 0.8); q.quadraticCurveTo(-0.82, 0, -1.22, -0.8); q.lineTo(-1.32, -0.8);
        q.quadraticCurveTo(-0.92, 0, -1.32, 0.8); q.closePath(); out.push(q);
      }
    } else {
      const p = new T.Shape(); p.moveTo(-1, 0.7); p.lineTo(0.75, 0); p.lineTo(-1, -0.7); p.closePath(); out.push(p);
    }
    if (INV[type]) {
      const c = new T.Shape(); c.absarc(b === 'NOT' ? 0.9 : 0.95, 0, 0.15, 0, Math.PI * 2, false); out.push(c);
    }
    return out;
  }
  function gateMesh(type) {
    const grp = new T.Group();
    const mat = new T.MeshStandardMaterial({ color: COL.gate, roughness: 0.42, metalness: 0.05 });
    bodyShapes(type).forEach(sh => {
      const g = new T.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2, curveSegments: 28 });
      g.translate(0, 0, -0.15);
      grp.add(new T.Mesh(g, mat));
    });
    const lb = label(type, 1.1, '#12302f', type.length > 3 ? 50 : 60);
    lb.position.set(type === 'NOT' ? -0.42 : -0.18, 0, 0.21);
    grp.add(lb);
    grp.scale.setScalar(S);
    grp.userData.mat = mat;
    return grp;
  }
  function switchMesh(name) {
    const g = new T.Group();
    g.add(new T.Mesh(new T.BoxGeometry(1.1, 0.8, 0.3), new T.MeshStandardMaterial({ color: 0x1a2c2e, roughness: 0.7 })));
    const slotTrack = new T.Mesh(new T.BoxGeometry(0.86, 0.26, 0.02), new T.MeshStandardMaterial({ color: 0x050c0d }));
    slotTrack.position.z = 0.16; g.add(slotTrack);
    const knobMat = new T.MeshStandardMaterial({ color: 0x55616a, roughness: 0.4 });
    const knob = new T.Mesh(new T.BoxGeometry(0.42, 0.56, 0.3), knobMat);
    knob.position.z = 0.26; g.add(knob);
    const dig = label('0', 0.7, '#e4ece6', 84); dig.position.z = 0.17; knob.add(dig);
    const nm = label(name, 1.0, '#e4ece6', 76); nm.position.set(-1.05, 0, 0.05); g.add(nm);
    g.userData = { knob, knobMat, dig, target: -0.2 };
    return g;
  }
  function lampMesh(name) {
    const g = new T.Group();
    const sock = new T.Mesh(new T.CylinderGeometry(0.34, 0.4, 0.3, 24), new T.MeshStandardMaterial({ color: 0x2a3a3c, metalness: 0.6, roughness: 0.4 }));
    sock.rotation.x = Math.PI / 2; g.add(sock);
    const bulbMat = new T.MeshStandardMaterial({ color: 0x33403f, roughness: 0.2, emissive: 0x000000 });
    const bulb = new T.Mesh(new T.SphereGeometry(0.46, 32, 24), bulbMat); bulb.position.z = 0.3; g.add(bulb);
    const halo = new T.Mesh(new T.SphereGeometry(0.75, 24, 16), new T.MeshBasicMaterial({ color: COL.on, transparent: true, opacity: 0, depthWrite: false }));
    halo.position.z = 0.3; g.add(halo);
    const light = new T.PointLight(COL.on, 0, 6); light.position.z = 1; g.add(light);
    const dig = label('?', 0.7, '#e4ece6', 84); dig.position.z = 0.8; g.add(dig);
    const nm = label(name, 1.0, '#e4ece6', 76); nm.position.set(1.05, 0, 0.05); g.add(nm);
    g.userData = { bulbMat, halo, light, dig };
    return g;
  }
  function slotMesh() {
    const g = new T.Group();
    const geo = new T.BoxGeometry(2.3, 1.8, 0.3);
    const box = new T.Mesh(geo, new T.MeshStandardMaterial({ color: COL.slot, transparent: true, opacity: 0.1, depthWrite: false }));
    const edgeMat = new T.LineBasicMaterial({ color: COL.slot, transparent: true, opacity: 0.9 });
    const edges = new T.LineSegments(new T.EdgesGeometry(geo), edgeMat);
    const q = label('?', 1.2, '#6fd3c8', 100); q.position.z = 0.2;
    g.add(box, edges, q); g.position.x = -0.08;
    g.userData = { box, edgeMat, q };
    return g;
  }

  // ---------- wires
  function roundedPath(pts, r = 0.22) {
    const P = [];
    pts.forEach(p => { const q = P[P.length - 1]; if (!q || q.distanceTo(p) > 1e-4) P.push(p); });
    const path = new T.CurvePath();
    let cur = P[0];
    for (let i = 1; i < P.length; i++) {
      const p = P[i];
      if (i < P.length - 1) {
        const din = p.clone().sub(P[i - 1]), dout = P[i + 1].clone().sub(p);
        const rr = Math.min(r, din.length() / 2, dout.length() / 2);
        const a = p.clone().sub(din.normalize().multiplyScalar(rr));
        const b = p.clone().add(dout.normalize().multiplyScalar(rr));
        if (cur.distanceTo(a) > 1e-4) path.add(new T.LineCurve3(cur, a));
        path.add(new T.QuadraticBezierCurve3(a, p.clone(), b));
        cur = b;
      } else path.add(new T.LineCurve3(cur, p));
    }
    return path;
  }
  const dotGeo = () => new T.SphereGeometry(0.075, 10, 8);
  function makeWire(group, pts) {
    const path = roundedPath(pts), len = path.getLength();
    const samples = path.getSpacedPoints(Math.max(20, Math.ceil(len * 24)));
    const mat = new T.MeshStandardMaterial({ color: COL.unknown, roughness: 0.5, metalness: 0.3 });
    const mesh = new T.Mesh(new T.TubeGeometry(path, Math.max(24, Math.ceil(len * 14)), 0.06, 8, false), mat);
    const head = new T.Mesh(new T.SphereGeometry(0.15, 16, 12), new T.MeshBasicMaterial({ color: COL.on }));
    head.visible = false;
    group.add(mesh, head);
    const dots = [], n = Math.max(1, Math.round(len / 1.1)), dg = dotGeo(), dm = new T.MeshBasicMaterial({ color: 0xfff1cf });
    for (let i = 0; i < n; i++) { const d = new T.Mesh(dg, dm); d.visible = false; group.add(d); dots.push(d); }
    const w = {
      len, mat, head, dots, samples, shown: undefined, prev: null, phase: Math.random(),
      at(u, target) { const k = Math.min(samples.length - 1, Math.max(0, Math.round(u * (samples.length - 1)))); target.copy(samples[k]); },
      set(v) {
        if (w.shown === v) return; w.shown = v;
        mat.color.setHex(v === 1 ? COL.on : v === 0 ? COL.off : COL.unknown);
        mat.emissive.setHex(v === 1 ? 0x7a4400 : 0x000000);
      }
    };
    return w;
  }

  // ---------- world (renderer, camera, board, loop)
  function createWorld(el) {
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(COL.bg);
    el.appendChild(renderer.domElement);
    const scene = new T.Scene();
    scene.fog = new T.Fog(COL.bg, 30, 60);
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
    scene.add(new T.HemisphereLight(0xd6ecff, 0x0a1414, 0.8));
    const key = new T.DirectionalLight(0xffffff, 0.75); key.position.set(-5, -7, 12); scene.add(key);
    const board = new T.Mesh(new T.PlaneGeometry(120, 80), new T.MeshStandardMaterial({ color: COL.board, roughness: 0.95 }));
    board.position.z = -0.32; scene.add(board);
    const grid = new T.GridHelper(120, 120, COL.grid, COL.grid); grid.rotation.x = Math.PI / 2; grid.position.z = -0.3; scene.add(grid);

    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = { cx: 0, cy: 0, w: 10, h: 6 };
    const base = V(0, 0, 10), look = V(0, 0, 0), sway = { x: 0, y: 0, tx: 0, ty: 0 };
    const fns = new Set();
    function resize() {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const tan = Math.tan(camera.fov * Math.PI / 360);
      const dist = Math.max((frame.h / 2) / tan, (frame.w / 2) / (tan * camera.aspect)) * 1.06 + 0.6;
      base.set(frame.cx, frame.cy - dist * 0.3, dist);
      look.set(frame.cx, frame.cy - 0.15, 0);
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(el);
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      sway.tx = ((e.clientX - r.left) / r.width - 0.5); sway.ty = ((e.clientY - r.top) / r.height - 0.5);
    });
    let last = performance.now(), time = 0;
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
      if (!reduce) { sway.x += (sway.tx - sway.x) * 0.05; sway.y += (sway.ty - sway.y) * 0.05; }
      camera.position.set(base.x + sway.x * 1.2, base.y - sway.y * 0.8, base.z);
      camera.lookAt(look);
      fns.forEach(f => f(dt, time));
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    }
    resize(); requestAnimationFrame(loop);
    return {
      scene, camera, renderer, el, reduce,
      fit(b) { frame = b; resize(); },
      on(f) { fns.add(f); }, off(f) { fns.delete(f); }
    };
  }

  // ---------- circuit
  // spec.nodes: [{id, type:'IN'|'OUT'|GATE|'SLOT', x, y, in:[ids], label?, mx?:[..]}] in topological order
  function buildCircuit(world, spec) {
    const group = new T.Group(); world.scene.add(group);
    const nodes = {}, order = [], wires = [], pickables = [];
    spec.nodes.forEach(n => {
      const nd = Object.assign({ in: [] }, n);
      nd.isSlot = n.type === 'SLOT'; nd.slotType = null; nd.shown = undefined;
      nodes[n.id] = nd; order.push(nd);
    });
    order.forEach(nd => { nd.depth = nd.type === 'IN' ? 0 : Math.max(...nd.in.map(i => nodes[i].depth)) + 1; });
    const maxDepth = Math.max(...order.map(n => n.depth));
    const gateType = nd => (nd.isSlot ? nd.slotType : nd.type);

    order.forEach(nd => {
      const g = new T.Group(); g.position.set(nd.x, nd.y, 0); group.add(g); nd.obj = g;
      let hw = 2.4, hx = 0;
      if (nd.type === 'IN') {
        nd.vis = switchMesh(nd.label || nd.id); g.add(nd.vis);
        nd.outPin = V(nd.x + 0.5, nd.y); hw = 2.2; hx = -0.4;
      } else if (nd.type === 'OUT') {
        nd.vis = lampMesh(nd.label || nd.id); g.add(nd.vis);
        nd.inPins = [V(nd.x - 0.3, nd.y)]; hw = 2.2; hx = 0.4;
      } else {
        nd.inPins = nd.in.length === 1 ? [V(nd.x - 0.75 * S, nd.y)]
          : [V(nd.x - 0.75 * S, nd.y + 0.4 * S), V(nd.x - 0.75 * S, nd.y - 0.4 * S)];
        nd.outPin = V(nd.x + 0.6 * S, nd.y);
        if (nd.isSlot) { nd.ghost = slotMesh(); g.add(nd.ghost); }
        else { nd.vis = gateMesh(nd.type); g.add(nd.vis); }
      }
      const hit = new T.Mesh(new T.BoxGeometry(hw, 1.8, 1), new T.MeshBasicMaterial({ visible: false }));
      hit.position.x = hx; hit.userData.node = nd; g.add(hit); pickables.push(hit);
    });

    order.forEach(nd => nd.in.forEach((sid, i) => {
      const src = nodes[sid], p0 = src.outPin, p1 = nd.inPins[i];
      let mx = nd.type === 'OUT' ? p1.x - 0.7 : p1.x - 0.55 - 0.32 * i;
      if (nd.mx && nd.mx[i] != null) mx = nd.mx[i];
      mx = Math.max(mx, p0.x + 0.25);
      const pts = Math.abs(p0.y - p1.y) < 1e-3 ? [p0, p1] : [p0, V(mx, p0.y), V(mx, p1.y), p1];
      const w = makeWire(group, pts); w.src = sid; w.dst = nd.id; wires.push(w);
    }));

    function paintNode(nd, v) {
      if (nd.shown === v) return; nd.shown = v;
      const u = nd.vis && nd.vis.userData;
      if (nd.type === 'IN') {
        u.target = v ? 0.2 : -0.2;
        u.knobMat.color.setHex(v ? COL.on : 0x55616a);
        u.knobMat.emissive.setHex(v ? 0x5a3200 : 0);
        u.dig.userData.set(v ? '1' : '0', v ? '#1a1000' : '#e4ece6');
      } else if (nd.type === 'OUT') {
        u.bulbMat.color.setHex(v === 1 ? 0xffd27a : 0x33403f);
        u.bulbMat.emissive.setHex(v === 1 ? 0xff9a00 : 0);
        u.light.intensity = v === 1 ? 1.6 : 0;
        u.halo.material.opacity = v === 1 ? 0.18 : 0;
        u.dig.userData.set(v == null ? '?' : String(v), v === 1 ? '#1a1000' : '#e4ece6');
      } else if (u) {
        u.mat.emissive.setHex(v === 1 ? 0x3a2400 : 0);
      }
    }

    function evaluate(inputs) {
      const v = {};
      order.forEach(nd => {
        if (nd.type === 'IN') v[nd.id] = inputs[nd.id] ? 1 : 0;
        else if (nd.type === 'OUT') v[nd.id] = v[nd.in[0]];
        else {
          const t = gateType(nd), a = nd.in.map(i => v[i]);
          v[nd.id] = !t || a.some(x => x == null) ? null : apply(t, a);
        }
      });
      return v;
    }

    let anim = null;
    function tick(dt, time) {
      if (anim) {
        anim.t += dt * anim.speed;
        const t = anim.t;
        wires.forEach(w => {
          const k = t - nodes[w.src].depth, tv = anim.target[w.src];
          if (k <= 0) w.head.visible = false;
          else if (k < 1) {
            w.head.visible = tv != null; w.at(k, w.head.position);
            w.head.material.color.setHex(tv === 1 ? COL.on : COL.zeroHead);
          } else { w.head.visible = false; w.set(tv); }
        });
        order.forEach(nd => { if (t >= nd.depth) paintNode(nd, anim.target[nd.id]); });
        if (t >= maxDepth + 0.2) { const cb = anim.done; anim = null; cb && cb(); }
      }
      wires.forEach(w => {
        const on = w.shown === 1 && !world.reduce;
        w.dots.forEach((d, i) => {
          d.visible = on;
          if (on) w.at((w.phase + i / w.dots.length + time * 0.7 / w.len) % 1, d.position);
        });
      });
      order.forEach(nd => {
        if (nd.type === 'IN') { const u = nd.vis.userData; u.knob.position.x += (u.target - u.knob.position.x) * 0.25; }
        if (nd.type === 'OUT' && nd.shown === 1) {
          const u = nd.vis.userData; u.halo.scale.setScalar(1 + Math.sin(time * 4) * 0.05);
        }
        if (nd.isSlot) nd.ghost.userData.edgeMat.opacity = nd.selected ? 0.6 + Math.sin(time * 6) * 0.4 : nd.slotType ? 0.25 : 0.8;
      });
    }
    world.on(tick);

    const ins = order.filter(n => n.type === 'IN').map(n => n.id);
    const outs = order.filter(n => n.type === 'OUT').map(n => n.id);

    function name(id, sym) {
      const nd = nodes[id];
      if (nd.type === 'IN') return nd.label || nd.id;
      if (nd.type === 'OUT') return name(nd.in[0], sym);
      const t = gateType(nd) || '?';
      const a = nd.in.map(i => (nodes[i].type === 'IN' || (sym && gateType(nodes[i]) === 'NOT')) ? name(i, sym) : '(' + name(i, sym) + ')');
      if (t === 'NOT') return sym ? '¬' + a[0] : 'NOT ' + a[0];
      if (!sym) return a.join(` ${t} `);
      const op = { AND: ' · ', NAND: ' · ', OR: ' + ', NOR: ' + ', XOR: ' ⊕ ', XNOR: ' ⊕ ', '?': ' ? ' }[t];
      return INV[t] ? '¬(' + a.join(op) + ')' : a.join(op);
    }

    const mouse = new T.Vector2(), ray = new T.Raycaster();
    return {
      nodes, order, wires, ins, outs, maxDepth, evaluate,
      get busy() { return !!anim; },
      run(inputs, opts = {}) {
        const target = evaluate(inputs);
        anim = { t: 0, speed: opts.speed || 2.4, target, done: opts.onDone };
        return target;
      },
      show(inputs) {
        anim = null; const v = evaluate(inputs);
        order.forEach(nd => paintNode(nd, v[nd.id]));
        wires.forEach(w => { w.set(v[w.src]); w.head.visible = false; });
        return v;
      },
      conceal(inputs) {
        anim = null;
        order.forEach(nd => paintNode(nd, nd.type === 'IN' ? (inputs[nd.id] ? 1 : 0) : null));
        wires.forEach(w => { w.set(nodes[w.src].type === 'IN' ? (inputs[w.src] ? 1 : 0) : null); w.head.visible = false; });
      },
      setSlot(id, type) {
        const nd = nodes[id]; if (!nd.isSlot) return;
        if (nd.vis) { nd.obj.remove(nd.vis); nd.vis = null; }
        nd.slotType = type || null; nd.shown = undefined;
        if (type) { nd.vis = gateMesh(type); nd.obj.add(nd.vis); }
        nd.ghost.userData.q.visible = !type;
        nd.ghost.userData.box.material.opacity = type ? 0.04 : 0.1;
      },
      select(id) { order.forEach(n => (n.selected = n.id === id)); },
      expression: name,
      steps(inputs) {
        const v = evaluate(inputs);
        return order.filter(n => n.type !== 'IN' && n.type !== 'OUT').map(n => {
          const t = gateType(n);
          return { node: n, type: t, ins: n.in.map(i => v[i]), out: v[n.id], label: name(n.id) };
        });
      },
      pick(ev, filter) {
        const r = world.el.getBoundingClientRect();
        mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(mouse, world.camera);
        for (const h of ray.intersectObjects(pickables, false)) {
          const nd = h.object.userData.node; if (!filter || filter(nd)) return nd;
        }
        return null;
      },
      fit() {
        const xs = order.map(n => n.x), ys = order.map(n => n.y);
        const x0 = Math.min(...xs) - 1.8, x1 = Math.max(...xs) + 1.7, y0 = Math.min(...ys) - 1.2, y1 = Math.max(...ys) + 1.2;
        world.fit({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 });
      },
      dispose() {
        world.off(tick); world.scene.remove(group);
        group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      }
    };
  }

  // ---------- helpers
  function combos(n) {
    const out = [];
    for (let i = 0; i < 1 << n; i++) out.push([...Array(n)].map((_, k) => (i >> (n - 1 - k)) & 1));
    return out;
  }
  let actx;
  function beep(f = 660, d = 0.12, type = 'sine', vol = 0.05) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
      o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
    } catch (e) { /* audio is optional */ }
  }
  const chime = ok => ok ? (beep(660, 0.1), setTimeout(() => beep(990, 0.16), 90)) : beep(170, 0.25, 'square', 0.03);

  function truthTableHTML(type, highlight) {
    const rows = type === 'NOT' ? [[0], [1]] : combos(2);
    const head = (type === 'NOT' ? '<th>A</th>' : '<th>A</th><th>B</th>') + '<th>Q</th>';
    const body = rows.map(r => {
      const q = apply(type, r), hl = highlight && r.every((x, i) => x === highlight[i]);
      return `<tr${hl ? ' class="hl"' : ''}>${r.map(x => `<td>${x}</td>`).join('')}<td class="q${q}">${q}</td></tr>`;
    }).join('');
    return `<table class="tt"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  function guideHTML() {
    return GATES.map(t => `<div class="gcard"><div class="gname">${t}<span>${SYM[t]}</span></div>
      ${truthTableHTML(t)}<p>${t} ${RULE[t]}.</p></div>`).join('');
  }
  const fontsReady = Promise.race([
    document.fonts ? document.fonts.load('600 64px "IBM Plex Mono"').catch(() => {}) : Promise.resolve(),
    new Promise(r => setTimeout(r, 1500))
  ]);

  window.LG = { COL, FN, GATES, RULE, SYM, INV, apply, createWorld, buildCircuit, combos, beep, chime, truthTableHTML, guideHTML, fontsReady };
})();
