// Light Grid: Towers. A slow glide down a boulevard of dark towers outlined in
// light, pulses climbing their edges, lit floors here and there, the street
// reflecting it all. A great tower at the end sends a beam into the clouds and
// a patrol craft drifts across the sky.
// media: 1024 427 12 60
// still: 0
// detail: -.07 -.02 .07 .5     the great tower and its beam, pulsing
// detail: .35 -.27 .62 .26     towers either side of the avenue: rooms, pulses
// detail: -.47 -.24 -.24 .27
// detail: -.89 -.32 -.56 .23
// detail: .62 -.36 .89 .31
// detail: -.36 -.5 .36 -.02    traffic along the avenue, to and from the tower

const vec3 CYAN = vec3(.02, .78, 1.);
const vec3 ORANGE = vec3(1., .32, .03);
const vec3 GRID = vec3(.16, .42, .62);
const float SPEED = 1.4;

float camZ() { return SPEED * ST; }

// One tower per plot on a square grid, set inside its plot so a march step
// only ever needs the plot it's in. Plots along x = 0 are an open avenue.
const float CELL = 14.;
vec4 towerOf(vec2 cell, out float h) {
  float r = hash21(cell * 1.37 + 4.1), r2 = hash21(cell * 2.91 - 7.3);
  vec2 c = (cell + .5) * CELL + (vec2(r, r2) - .5) * 2.5;
  vec2 half_ = vec2(2.2 + 2.2 * r2, 2.2 + 2.2 * r);
  h = 6. + 22. * pow(r, 2.) + (r2 > .9 ? 26. : 0.);
  if (abs(cell.x + .5) < 1. || r2 < .12) h = 0.;   // avenue, plazas
  return vec4(c, half_);
}

float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }

// Returns how far to step; `box` is the distance to this plot's tower, the
// only thing that counts as a hit. (Stepping onto the next plot is a small
// fixed hop; counting that as a hit too drew phantom edges far away.)
float city(vec3 p, vec3 rd, out vec4 tw, out float th, out float box) {
  vec2 cell = floor(p.xz / CELL);
  tw = towerOf(cell, th);
  box = th > 0. ? sdBox(p - vec3(tw.x, th * .5, tw.y), vec3(tw.z, th * .5, tw.w)) : 1e9;
  // never step past the edge of this plot
  vec2 local = p.xz - cell * CELL;
  vec2 toEdge = vec2(rd.x > 0. ? CELL - local.x : local.x, rd.z > 0. ? CELL - local.y : local.y) / max(abs(rd.xz), vec2(1e-3));
  return min(box, min(toEdge.x, toEdge.y) + .05);
}

// The closest a ray came to a tower it passed (not the one it lands on): a
// ray that just misses a tower's edge and goes on to hit something behind
// still lights that edge (the far edges of street-facing walls were dashed).
float nearBox = 1e9, nearT = 0.;
vec4 nearTw = vec4(0);

float march(vec3 ro, vec3 rd, float maxT, out vec4 tw, out float th) {
  nearBox = 1e9;
  float passBox = 1e9, passT = 0.;     // closest so far to the tower in this plot
  vec4 passTw = vec4(0);
  float t = .05;
  // the closest pass to a tower, for rays that graze an edge and run out of
  // steps before counting a hit (they left gaps: dashed edges)
  float bestBox = 1e9, bestT = 0.;
  vec4 bestTw = vec4(0); float bestTh = 0.;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd * t;
    if (p.y > 60. && rd.y > 0.) break;
    float box;
    float d = city(p, rd, tw, th, box);
    if (box < bestBox) { bestBox = box; bestT = t; bestTw = tw; bestTh = th; }
    if (tw.xy != passTw.xy) {                       // into another plot: keep the pass
      if (passBox < nearBox) { nearBox = passBox; nearT = passT; nearTw = passTw; }
      passBox = 1e9; passTw = tw;
    }
    if (th > 0. && box < passBox) { passBox = box; passT = t; }
    if (box < .0008 * t + .001) {
      // close enough: take the exact hit on this tower's box, so edges drawn
      // from the hit point don't flicker into dashes
      vec3 inv = 1. / rd;
      vec3 bmin = vec3(tw.x - tw.z, 0., tw.y - tw.w), bmax = vec3(tw.x + tw.z, th, tw.y + tw.w);
      vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
      vec3 lo = min(t0, t1), hi = max(t0, t1);
      float tin = max(max(lo.x, lo.y), lo.z), tout = min(min(hi.x, hi.y), hi.z);
      return tin <= tout && tin > 0. && abs(tin - t) < 1. ? tin : t;
    }
    t += d;
    if (t > maxT) break;
  }
  if (bestBox < .002 * bestT + .02) { tw = bestTw; th = bestTh; return bestT; }
  return 1e9;
}

// A glowing line along d = 0, w wide, but at least ~1.5 pixels on screen
// (fwidth), dimmed as it widens so far lines don't bloom.
float line(float d, float w) {
  float aa = min(fwidth(d) * 1.5, w * 4.);
  float ww = max(w, aa);
  return smoothstep(ww, 0., d) * w / ww;
}

// Shading of a tower face: near-black glass, light along every edge, a few
// lit floors, pulses running up the vertical edges.
// A lit room, in the Grid's colors: mostly cyan (deep teal to electric),
// some icy pale cyan, and now and then the orange of the light-cycles,
// a little more often on the towers that lean orange.
vec3 roomLight(vec2 cell, float id) {
  float r = hash21(cell * 1.3 + id * 9.), k = hash21(cell * 2.7 + id * 4.);
  float orangeShare = hash11(id * 13.1) > .9 ? .14 : .02;
  if (r < orangeShare) return ORANGE * 1.15;
  if (r > .8) return mix(CYAN, vec3(1), .55);                // icy pale cyan
  return mix(vec3(.0, .32, .55), CYAN * 1.15, .35 + .65 * k); // deep teal to electric cyan
}

float lit(vec2 wc, float share) { return step(1. - share, hash21(wc)); }

// How busy a tower is (some nearly dark, some bright), and floor by floor
// (whole floors lit or dark, as offices are at night).
float occupancy(float id, float floorRow) {
  float building = .12 + .55 * hash11(id * 91.7);
  float fl = hash11(floor(floorRow) * 1.37 + id * 17.);
  return clamp(building * (fl < .3 ? .2 : (fl > .85 ? 2. : 1.)), 0., .95);
}

// The rooms on a facade at level L (0: each window; L: blocks of 2^L x 2^L
// windows, drawn as their average). fp is in window units.
vec3 windows(vec2 fp, float id, float L) {
  float size = exp2(L);
  vec2 cell = floor(fp / size), f = fract(fp / size);
  vec2 wc = cell + id * 31. + L * 7.1;
  if (L < .5) {
    float shape = smoothstep(.32, .22, abs(f.y - .5)) * smoothstep(.42, .32, abs(f.x - .5));
    float halo = smoothstep(.95, .1, length((f - .5) * vec2(1., 1.25)));
    float period = mix(6. + 12. * hash21(wc + 5.), 60. + 140. * hash21(wc + 5.), detail);
    float ph = time / period + hash21(wc + 9.) * 10.;
    float share = occupancy(id, cell.y) * mix(1., 1.1, detail);
    float on = mix(lit(wc + floor(ph) * 1.7, share), lit(wc + (floor(ph) + 1.) * 1.7, share),
                   smoothstep(1. - mix(.05, .3, detail), 1., fract(ph)));
    float pulse = mix(.75 + .25 * sin(time * 1.4 + hash21(wc) * 40.), .85 + .15 * sin(time * .3 + hash21(wc) * 40.), detail);
    float level = .6 + .8 * hash21(wc + 3.);       // some rooms brighter than others
    return roomLight(cell, id) * on * pulse * level * (shape * 2.1 + halo * .45);
  }
  // a block: lit share varies from block to block (whole lit floors, dark
  // offices), color from its rooms
  float share = occupancy(id, (cell.y + .5) * size) * (.6 + .8 * hash21(wc));
  return roomLight(cell, id) * share * .9 * (.9 + .2 * sin(time * .2 + hash21(wc) * 30.));
}

vec3 gEmit = vec3(0);

// The avenue's traffic: light-cycles in four lanes, two each way (cyan
// toward the great tower, orange back), each trailing a light wall.
const float AVENUE_EDGE = 10.5;
const float LANES[4] = float[4](-7.5, -3.2, 3.2, 7.5);
const float WALL_H = 1.6;
vec3 cycleColor(int i) { return i < 2 ? ORANGE : CYAN; }
// How lit lane i's light wall is at z: 1 at a cycle, fading back along its
// wall, 0 between cycles. Cyan lanes run away from the camera, orange ones
// toward it.
float cycleU(int i, float z) {
  float dir = i < 2 ? -1. : 1.;
  float speed = (i == 0 || i == 3) ? 9. : 6.5;
  float spacing = 30. + 9. * float(i);
  return fract((dir * z - time * speed) / spacing + float(i) * .37);      // 1 at the cycle
}
float cycleTrail(int i, float z) {
  float u = cycleU(i, z);
  float len = .45;
  return smoothstep(1. - len, 1., u) * smoothstep(1., .995, u);
}   // light from the last towerColor() call's rooms

vec3 towerColor(vec3 p, vec3 rd, vec4 tw, float th, float t) {
  vec3 l = p - vec3(tw.x, th * .5, tw.y);
  vec3 b = vec3(tw.z, th * .5, tw.w);
  vec3 q = b - abs(l);                       // distance to each face pair
  // the two smallest distances tell how close to an edge we are
  float ey = q.y;
  // which face: the one the hit point is closest to
  vec3 n = q.x < q.z ? vec3(sign(l.x), 0, 0) : vec3(0, 0, sign(l.z));
  if (q.y < min(q.x, q.z)) n = vec3(0, 1, 0);
  float vert = n.x != 0. ? q.z : q.x;        // across the face to its vertical edge
  float id = hash21(tw.xy);
  vec3 col = vec3(.004, .008, .012);
  // sky and floor reflected in the glass
  float fres = pow(1. - abs(dot(n, -rd)), 4.);
  col += mix(vec3(.002, .006, .008), CYAN * .012, smoothstep(0., 1., rd.y + .3)) * (.3 + fres);
  // edges
  // Edges never thinner than a pixel: a far one is drawn a pixel wide and
  // dimmer, rather than breaking into dashes (it looked like rain).
  float px = t * 1.5 / (resolution.y * 1.35);    // a pixel's width here, in world units
  float w0 = .035, w = max(w0, px), energy = w0 / w;
  // ...and never thinner than ~1.5 pixels on screen either, even on a face
  // seen side-on (a slanting sub-pixel line comes out as dashes)
  float edges = 0.;
  if (n.y > .5) edges = line(min(q.x, q.z), w);                    // roof outline
  else edges = line(vert, w) + line(ey, w);                        // vertical corners, roof line
  edges *= energy * smoothstep(260., 130., t);                     // far edges melt into the haze
  // Rooms, the city's light (returned in gEmit so it shines through the
  // haze rather than fading with the walls). Near towers show each window:
  // about 45% lit, cool white or warm amber, glowing onto the wall; in full
  // motion each switches on and off at its own random moments, in Lite they
  // pulse slowly and now and then one goes dark for minutes. Farther away,
  // where a window is under a pixel, the facade becomes blocks of lit and
  // dark rooms at a coarser scale, the speckle a city has at night.
  vec2 fp = vec2(n.x != 0. ? p.z : p.x, p.y) / vec2(.7, .55);
  float side = n.y > .5 ? 0. : smoothstep(.04, .2, abs(dot(n, rd)));   // not on roofs, nor walls seen edge-on
  float lod = clamp(log2(px / .16), 0., 5.);
  float l0 = floor(lod);
  vec3 emit = mix(windows(fp, id, l0), windows(fp, id, l0 + 1.), fract(lod)) * side;
  // Light strips, as on the towers of the Grid: a glowing line every few
  // floors on about half the towers (cyan, or orange on the orange-side
  // ones), with a pulse of light running along it (in Lite, a slow
  // breath); and a band of light around the crown of the tallest towers.
  // Both stay at least a pixel wide, so they hold up in the distance.
  vec3 stripColor = hash11(id * 13.1) > .9 ? ORANGE : CYAN;
  float every = 4. + 2. * floor(hash11(id * 5.3) * 3.);       // every 4, 6 or 8 floors
  float spacing = every * .55;
  float strip = line((.5 - abs(fract(p.y / spacing) - .5)) * spacing, .06);   // distance to the nearest strip
  float run = n.x != 0. ? p.z : p.x;
  float travel = .55 + .9 * exp(-pow(fract(run * .05 - time * .35 + id * 3.) - .5, 2.) * 60.);
  strip *= step(.5, hash11(id * 2.9)) * side * mix(travel, .8 + .2 * sin(time * .5 + id * 20.), detail);
  float crown = line(abs(ey - .45), .3) * step(30., th) * side;          // a band just under the roof
  gEmit = emit + stripColor * (strip * 1.4 + crown * 1.6);
  return col;
}

// The great tower's slow pulse, shared by its beam and its edges.
float towerPulse() { return .72 + .28 * sin(time * .7); }

vec3 sky(vec3 rd, float beamAmt) {
  float e = rd.y, az = atan(rd.x, rd.z);
  vec3 col = mix(srgb(vec3(.03, .09, .13)), srgb(vec3(.004, .01, .02)), smoothstep(-.02, .5, e));
  vec2 sp = vec2(az * 160., e * 160.);
  float star = hash21(floor(sp));
  if (star > .985 && e > .1)
    col += vec3(.6, .85, 1.) * smoothstep(.25, 0., length(fract(sp) - .5)) * (.6 + .4 * sin(ST * (1. + star * 4.) + star * 50.)) * (star - .985) * 30.;
  vec2 cp = vec2(az * 3. + ST * .01, e * 7.);
  float cl = fbm(cp + vec2(fbm(cp * 1.3 + ST * .02), 0.));
  float clouds = smoothstep(.38, .75, cl) * smoothstep(.06, .2, e);
  col = mix(col, srgb(vec3(.05, .11, .15)), clouds * .8);
  // the beam lights the clouds around it
  float bw = abs(az);
  col += beamAmt * vec3(.75, .95, 1.) * (exp(-bw * 900.) * 1.2 + exp(-bw * 90.) * .12) * smoothstep(.1, .14, e) * towerPulse();
  col += CYAN * clouds * cl * exp(-bw * 6.) * .25 * beamAmt;
  // patrol craft: an orange-lit arch crossing slowly
  float cx = mod(ST * .018 + .3, 2.4) - 1.2;
  vec2 rp = (vec2(az, e) - vec2(cx, .3)) * vec2(1, 1.);
  float body = step(abs(rp.y), .006) * step(abs(rp.x), .03);
  float legs = step(abs(abs(rp.x) - .027), .004) * step(-.025, rp.y) * step(rp.y, 0.);
  float shape = max(body, legs);
  col = mix(col, vec3(.005, .01, .012), shape);
  col += ORANGE * exp(-length(rp * vec2(1., 2.)) * 60.) * .35 + ORANGE * shape * step(rp.y, -.004) * 1.5;
  col += CYAN * .1 * exp(-abs(e) * 25.);
  return col;
}

void main() {
  vec2 sp = sceneP();
  float cz = camZ();
  // only a slight sway, so the avenue stays centred on the great tower
  vec3 ro = vec3(.25 * sin(ST * .05), 24. + 1.2 * sin(ST * .09), cz);
  vec3 fwd = normalize(vec3(.008 * sin(ST * .04), -.15, 1.));
  vec3 rt = normalize(cross(vec3(0, 1, 0), fwd)), up = cross(fwd, rt);
  vec3 rd = normalize(fwd * 1.35 + rt * sp.x + up * sp.y);

  vec4 tw; float th;
  float tFloor = rd.y < 0. ? -ro.y / rd.y : 1e9;
  float tT = march(ro, rd, min(tFloor, 320.), tw, th);
  vec3 col, emit = vec3(0);
  float tHit = min(tT, tFloor);
  if (tT < tFloor && tT < 1e8) {
    vec3 p = ro + rd * tT;
    col = towerColor(p, rd, tw, th, tT);
    emit = gEmit;
  } else if (tFloor < 1e8) {
    vec3 p = ro + rd * tFloor;
    vec2 g = p.xz / 4.;
    vec2 fw = fwidth(g), d = abs(fract(g - .5) - .5);
    vec2 core = 1. - smoothstep(vec2(.0035), .0035 + fw * 1.2, d);
    float lines = max(core.x, core.y) * (1. - smoothstep(.1, .6, max(fw.x, fw.y)));
    col = vec3(.006, .012, .017) + GRID * lines * .6 * exp(-tFloor * .02);
    // in Lite, street light only inside the moving traffic patch (anything
    // outside it would sit frozen in the still)
    float shown = detail > .5 ? smoothstep(.34, .3, abs(sp.x)) : 1.;
    // the avenue's edges: glowing lines with pulses running along them, and a
    // dimmer center line
    float px = tFloor * 1.5 / (resolution.y * 1.35);
    float edge = line(abs(abs(p.x) - AVENUE_EDGE), max(.08, px));
    float pulseRun = .5 + 1.2 * exp(-pow(fract(p.z * .02 - time * .3 * sign(p.x + .001)) - .5, 2.) * 50.);
    float center = line(abs(p.x), max(.04, px)) * .35;
    col += CYAN * (edge * pulseRun * 2.2 + exp(-abs(abs(p.x) - AVENUE_EDGE) * 2.) * .12 + center) * exp(-tFloor * .006) * shown;
    // light from the cycles and their walls on the street
    for (int i = 0; i < 4; i++) {
      float trail = cycleTrail(i, p.z);
      col += cycleColor(i) * trail * exp(-abs(p.x - LANES[i]) * .9) * 1.3 * exp(-tFloor * .008) * shown;
    }
    // reflections
    vec3 rr = reflect(rd, vec3(0, 1, 0));
    vec4 rtw; float rth;
    float rt = march(p + rr * .01, rr, 90., rtw, rth);
    vec3 rcol = sky(rr, .3);
    if (rt < 1e8) { rcol = towerColor(p + rr * rt, rr, rtw, rth, rt + tFloor); rcol += gEmit * exp(-rt * .02); }
    // a glossy floor, as on the Grid: the lit city mirrored in it
    float fres = .22 + .6 * pow(1. - abs(rd.y), 5.);
    col += rcol * fres * exp(-rt * .008) * 1.1;
  } else col = sky(rd, 1.);
  // atmosphere: haze thickening with distance, lit from below by the city
  float fog = 1. - exp(-min(tHit, 400.) * .015);
  vec3 haze = srgb(vec3(.025, .07, .095)) + CYAN * .006;
  haze = mix(haze, sky(normalize(vec3(rd.x, .002, rd.z)), 0.), smoothstep(90., 300., tHit));  // far haze meets the horizon
  vec3 walls = vec3(0);
  // light-cycles on the avenue, each with its light wall behind it
  // (vertical ribbons on the lane lines, bright along the top)
  for (int i = 0; i < 4; i++) {
    if (abs(rd.x) < 1e-4) continue;
    float tp = (LANES[i] - ro.x) / rd.x;
    if (tp <= 0. || tp > tHit) continue;
    vec3 q = ro + rd * tp;
    if (q.y < 0. || q.y > WALL_H) continue;
    float trail = cycleTrail(i, q.z);
    if (trail <= 0.) continue;
    float h = q.y / WALL_H;
    float glow = .5 + .7 * h * h + 3.2 * smoothstep(.85, 1., h);
    glow += 4. * smoothstep(.985, 1., cycleU(i, q.z));          // the cycle itself, white-hot
    float shownW = detail > .5 ? smoothstep(.34, .3, abs(sp.x)) : 1.;
    walls += mix(cycleColor(i), vec3(1), .35 * smoothstep(.985, 1., cycleU(i, q.z))) * trail * glow * exp(-tp * .003) * shownW;
  }

  // the city's glow in the air near street level
  haze += mix(CYAN, vec3(1., .7, .4), .35) * .05 * exp(-max(rd.y + .02, 0.) * 14.);
  col = mix(col, haze, fog * (tHit < 1e8 ? 1. : 0.));
  // rooms shine through the haze, fading far more slowly than the walls
  col += emit * exp(-tT * .0045) * (1. - .45 * fog);
  col += walls;   // (already faded with their own distance)
  // the great tower: a tall silhouette at the end of the boulevard
  vec2 gp = vec2(atan(rd.x, rd.z), rd.y);
  float gt = step(abs(gp.x), .018 - gp.y * .04) * step(gp.y, .1) * step(-.06, gp.y);
  if (tT > 1e8 && (tFloor > 1e8 || tFloor > 120.) && gt > 0.) {
    float base = smoothstep(.0, -.06, gp.y);   // its foot sinks into the haze
    col = mix(col, srgb(vec3(.01, .03, .04)), .85 * (1. - base));
    col += CYAN * smoothstep(.003, 0., abs(abs(gp.x) - (.018 - gp.y * .04))) * .8 * towerPulse();
  }
  fragColor = finish(col * 1.1);
}
