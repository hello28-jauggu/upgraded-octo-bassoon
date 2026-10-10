/** Hand-crafted + generated map variants for Tankster.io */
function rect(x, y, w, h) { return { x, y, w, h }; }

const MAPS = {
  open: {
    id: "open", name: "Open Field", world: 5000, walls: [],
  },
  corridors: {
    id: "corridors", name: "Corridors", world: 4800,
    walls: (() => {
      const w = [], W = 4800;
      for (let i = 0; i < 5; i++) {
        w.push(rect(500 + i * 750, 700, 45, 2400));
        w.push(rect(700, 500 + i * 750, 2400, 45));
      }
      return w;
    })(),
  },
  cross: {
    id: "cross", name: "Cross", world: 4500,
    walls: (() => {
      const W = 4500, c = W / 2, w = [];
      w.push(rect(c - 35, 350, 70, W - 700));
      w.push(rect(350, c - 35, W - 700, 70));
      w.push(rect(c - 280, c - 280, 180, 40));
      w.push(rect(c + 100, c - 280, 180, 40));
      w.push(rect(c - 280, c + 240, 180, 40));
      w.push(rect(c + 100, c + 240, 180, 40));
      return w;
    })(),
  },
  boxes: {
    id: "boxes", name: "Boxes", world: 5000,
    walls: (() => {
      const w = [];
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          if (Math.random() < 0.55) {
            const x = 400 + i * 700, y = 400 + j * 700;
            w.push(rect(x, y, 180, 30));
            w.push(rect(x, y, 30, 180));
            w.push(rect(x + 150, y, 30, 180));
            w.push(rect(x, y + 150, 180, 30));
          }
        }
      }
      return w;
    })(),
  },
  rings: {
    id: "rings", name: "Rings", world: 5000,
    walls: (() => {
      const w = [], W = 5000, c = W / 2;
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        w.push(rect(c + Math.cos(a) * 1000 - 25, c + Math.sin(a) * 1000 - 40, 50, 100));
      }
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        w.push(rect(c + Math.cos(a) * 1600 - 20, c + Math.sin(a) * 1600 - 35, 40, 90));
      }
      return w;
    })(),
  },
  maze_dense: {
    id: "maze_dense", name: "Dense Maze", world: 4800,
    walls: null, // generated at runtime
  },
};

const ROTATION = ["open", "corridors", "cross", "boxes", "rings", "maze_dense"];

function generateDenseMaze(world) {
  const walls = [];
  const cell = 280;
  for (let x = 200; x < world - 200; x += cell) {
    for (let y = 200; y < world - 200; y += cell) {
      if (Math.random() < 0.45) {
        const h = Math.random() < 0.5;
        walls.push({ x, y, w: h ? cell * 0.85 : 26, h: h ? 26 : cell * 0.85 });
      }
    }
  }
  return walls;
}

module.exports = { MAPS, ROTATION, generateDenseMaze };
