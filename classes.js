/** Tankster.io class tree — original diep-style progression (50+ builds) */
function c(name, o = {}) {
  return {
    name,
    reload: o.reload ?? 14,
    barrels: o.barrels ?? [0],
    color: o.color ?? "#00b2e1",
    bulletSpd: o.bulletSpd ?? 1,
    bulletDmg: o.bulletDmg ?? 1,
    bulletR: o.bulletR ?? 5,
    bulletLife: o.bulletLife ?? 55,
    spread: o.spread ?? 0,
    recoil: o.recoil ?? 0.35,
    fov: o.fov ?? 1,
    skill: o.skill ?? "bullet", // bullet | drone | trap | auto | smash
    drones: o.drones ?? 0,
    bodyMeta: o.bodyMeta ?? 1,
    speedMul: o.speedMul ?? 1,
  };
}
const ring = (n) => Array.from({ length: n }, (_, i) => (i * Math.PI * 2) / n);

const CLASSES = {
  // Tier 0
  basic: c("Basic"),

  // Tier 1 — lvl 15
  twin: c("Twin", { reload: 11, barrels: [-0.15, 0.15] }),
  sniper: c("Sniper", { reload: 22, bulletSpd: 1.5, bulletDmg: 1.45, bulletLife: 95, fov: 1.3 }),
  machine: c("Machine Gun", { reload: 6, bulletDmg: 0.55, spread: 0.38 }),
  flank: c("Flank Guard", { reload: 13, barrels: [0, Math.PI] }),

  // Tier 2 — lvl 30
  triple: c("Triple Shot", { reload: 12, barrels: [-0.2, 0, 0.2] }),
  quad: c("Quad Tank", { reload: 15, barrels: ring(4) }),
  twin_flank: c("Twin Flank", { reload: 12, barrels: [-0.14, 0.14, Math.PI - 0.14, Math.PI + 0.14] }),
  destroyer: c("Destroyer", { reload: 28, bulletDmg: 2.4, bulletR: 11, bulletLife: 40, recoil: 2.4 }),
  hunter: c("Hunter", { reload: 18, bulletSpd: 1.3, bulletDmg: 1.3, fov: 1.2, barrels: [-0.06, 0.06] }),
  assassin: c("Assassin", { reload: 24, bulletSpd: 1.55, bulletDmg: 1.55, bulletLife: 100, fov: 1.35 }),
  gunner: c("Gunner", { reload: 5, barrels: [-0.2, -0.07, 0.07, 0.2], bulletDmg: 0.42 }),
  trapper: c("Trapper", { reload: 16, skill: "trap", bulletLife: 200 }),
  overseer: c("Overseer", { reload: 18, skill: "drone", drones: 8, barrels: [-0.5, 0.5] }),
  tri_angle: c("Tri-Angle", { reload: 12, barrels: [0, 2.5, -2.5], speedMul: 1.15, recoil: 0.2 }),
  auto3: c("Auto 3", { reload: 14, skill: "auto", barrels: ring(3) }),
  smasher: c("Smasher", { reload: 999, skill: "smash", bodyMeta: 2.2, speedMul: 1.2, fov: 0.95 }),

  // Tier 3 — lvl 45
  triplet: c("Triplet", { reload: 10, barrels: [-0.14, 0, 0.14] }),
  penta: c("Penta Shot", { reload: 11, barrels: [-0.32, -0.16, 0, 0.16, 0.32] }),
  spread: c("Spread Shot", { reload: 14, barrels: [-0.5, -0.25, 0, 0.25, 0.5], bulletDmg: 0.7 }),
  octo: c("Octo Tank", { reload: 16, barrels: ring(8) }),
  hexa: c("Hexa Tank", { reload: 14, barrels: ring(6) }),
  annihilator: c("Annihilator", { reload: 30, bulletDmg: 2.9, bulletR: 13, bulletLife: 36, recoil: 3 }),
  hybrid: c("Hybrid", { reload: 26, bulletDmg: 2.1, bulletR: 9, bulletLife: 45, recoil: 1.8, skill: "drone", drones: 2 }),
  streamliner: c("Streamliner", { reload: 4, bulletDmg: 0.4, bulletSpd: 1.15 }),
  ranger: c("Ranger", { reload: 26, bulletSpd: 1.6, bulletDmg: 1.55, bulletLife: 110, fov: 1.4 }),
  stalker: c("Stalker", { reload: 25, bulletSpd: 1.55, bulletDmg: 1.5, fov: 1.35 }),
  predator: c("Predator", { reload: 19, bulletSpd: 1.35, bulletDmg: 1.35, fov: 1.25, barrels: [-0.08, 0, 0.08] }),
  battlesh: c("Battleship", { reload: 10, skill: "drone", drones: 6, barrels: [-0.4, 0.4, Math.PI - 0.4, Math.PI + 0.4] }),
  overlord: c("Overlord", { reload: 16, skill: "drone", drones: 8, barrels: ring(4) }),
  manager: c("Manager", { reload: 16, skill: "drone", drones: 8, barrels: [0], fov: 1.05 }),
  factory: c("Factory", { reload: 18, skill: "drone", drones: 6 }),
  necromancer: c("Necromancer", { reload: 15, skill: "drone", drones: 16, barrels: [-0.55, 0.55] }),
  builder: c("Builder", { reload: 17, skill: "trap" }),
  gunner_trap: c("Gunner Trapper", { reload: 12, skill: "trap", barrels: [-0.15, 0.15] }),
  auto5: c("Auto 5", { reload: 13, skill: "auto", barrels: ring(5) }),
  auto_smasher: c("Auto Smasher", { reload: 999, skill: "smash", bodyMeta: 1.8, speedMul: 1.15, auto: 1 }),
  landmine: c("Landmine", { reload: 999, skill: "smash", bodyMeta: 2.5, speedMul: 1.1, fov: 0.9 }),
  booster: c("Booster", { reload: 11, barrels: [0, 2.3, -2.3, 2.75, -2.75], speedMul: 1.25 }),
  fighter: c("Fighter", { reload: 11, barrels: [0, 2.4, -2.4, 1.15, -1.15], speedMul: 1.15 }),
  sprayer: c("Sprayer", { reload: 5, bulletDmg: 0.48, spread: 0.42 }),

  // Tier 4 — lvl 60
  nailgun: c("Nailgun", { reload: 3.5, bulletDmg: 0.35, bulletSpd: 1.2 }),
  vulcan: c("Vulcan", { reload: 4.5, bulletDmg: 0.42, spread: 0.22 }),
  mortar: c("Mortar", { reload: 26, bulletDmg: 2.2, bulletR: 9, bulletLife: 48, recoil: 1.8 }),
  carrier: c("Carrier", { reload: 12, skill: "drone", drones: 9, barrels: [-0.35, 0, 0.35] }),
  fortress: c("Fortress", { reload: 15, skill: "trap", barrels: ring(4) }),
  engineer: c("Engineer", { reload: 16, skill: "trap" }),
  auto_gunner: c("Auto Gunner", { reload: 6, skill: "auto", barrels: [-0.18, -0.06, 0.06, 0.18], bulletDmg: 0.4 }),
  spike: c("Spike", { reload: 999, skill: "smash", bodyMeta: 2.8, speedMul: 1.18 }),
  cyclone: c("Cyclone", { reload: 15, barrels: ring(12) }),
  dual: c("Dual", { reload: 9, barrels: [-0.1, 0.1], bulletDmg: 1.05 }),
};

const TREE = {
  1: ["basic"],
  15: ["twin", "sniper", "machine", "flank"],
  30: ["triple", "quad", "twin_flank", "destroyer", "hunter", "assassin", "gunner", "trapper", "overseer", "tri_angle", "auto3", "smasher"],
  45: ["triplet", "penta", "spread", "octo", "hexa", "annihilator", "hybrid", "streamliner", "ranger", "stalker", "predator", "battlesh", "overlord", "manager", "factory", "necromancer", "builder", "gunner_trap", "auto5", "auto_smasher", "landmine", "booster", "fighter", "sprayer"],
  60: ["nailgun", "vulcan", "mortar", "carrier", "fortress", "engineer", "auto_gunner", "spike", "cyclone", "dual"],
};

module.exports = { CLASSES, TREE, classCount: Object.keys(CLASSES).length };
