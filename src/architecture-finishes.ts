// Surface details in metres so the same finish works on a small house and a castle wall.
export const FINISH_HELPERS = /* glsl */`
float cellVariation(vec2 cell) {
  vec3 p = fract(vec3(cell.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec3 surfacePlane(vec3 viewPosition, vec3 fallback) {
  // View-space positions retain precision on the far side of the map.
  vec3 plane = cross(dFdx(viewPosition), dFdy(viewPosition));
  if (dot(plane, plane) < 1e-16) return fallback;
  return (vec4(normalize(plane), 0.0) * viewMatrix).xyz * (gl_FrontFacing ? 1.0 : -1.0);
}

vec2 roofProjection(vec3 p, vec3 n) {
  vec3 across = vec3(n.z, 0.0, -n.x);
  across = dot(across, across) > 0.00004 ? normalize(across) : vec3(1.0, 0.0, 0.0);
  return vec2(dot(p, across), dot(p, cross(across, n)));
}

vec2 roofCourses(vec3 p, vec3 n) {
  vec2 eave = vec2(n.z, -n.x);
  // Snap the heading of each planar roof to suppress subpixel normal noise in long tile rows.
  float azimuth = dot(eave, eave) > 0.00004 ? atan(eave.y, eave.x) : 0.0;
  azimuth = floor(azimuth * 57.29578 + 0.5) * 0.01745329;
  eave = vec2(cos(azimuth), sin(azimuth));
  return vec2(dot(p.xz, eave), dot(p.xz, vec2(-eave.y, eave.x)) - p.y * 0.39);
}

// Edge of a rounded block. Positive values lie in the joint.
float stoneJoint(vec2 cell, float radius) {
  vec2 corner = abs(fract(cell) - 0.5) - (0.465 - radius);
  return length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - radius;
}
`;

export const DIRT = /* glsl */`
  vec2 ground = vSurfacePosition.xz;
  vec3 weather = texture2D(uSurfaceTile, ground * 0.081 + vec2(0.37, 0.21)).rgb;
  vec3 stones = texture2D(uSurfaceTile, ground * 0.43 + vec2(0.73, 0.04)).rgb;
  float shoulder = 0.0;
  float rut = 0.0;
  #ifdef WORN_TRACK
    float across = vMapUv.x - 0.5;
    shoulder = smoothstep(0.24, 0.49, abs(across) + (weather.g - 0.5) * 0.18);
    float groove = abs(abs(across + (weather.r - 0.5) * 0.18) - (0.19 + (weather.g - 0.5) * 0.09));
    rut = (1.0 - smoothstep(0.023, 0.100, groove)) * smoothstep(0.16, 0.72, weather.r);
  #endif
  float gravel = smoothstep(0.56, 0.81, stones.g + (weather.r - 0.5) * 0.38) * (1.0 - rut * 0.85);
  float damp = smoothstep(0.31, 0.74, weather.r * 0.66 + stain * 0.21 + rut * 0.26);
  float moss = smoothstep(0.60, 0.87, weather.g * 0.56 + stain * 0.24 + shoulder * 0.29);
  vec3 earth = mix(vec3(0.109, 0.069, 0.035), vec3(0.047, 0.028, 0.015), damp);
  earth *= mix(0.72, 1.27, tex.r * 0.47 + grit * 0.53);
  vec3 chips = mix(vec3(0.137, 0.109, 0.076), vec3(0.246, 0.221, 0.166), tex.r);
  diffuseColor.rgb = mix(mix(earth, chips, gravel * (0.63 + shoulder * 0.24)), vec3(0.047, 0.061, 0.023), moss * 0.77);
  relief = 0.22 * grit * (1.0 - rut * 0.6) + gravel * 0.38 + 0.16 * stain - rut * 0.21;
  #ifdef WORN_TRACK
    vec3 bank = texture2D(uSurfaceTile, ground * 0.34 + vec2(0.31, 0.62)).rgb;
    vec3 soil = mix(vec3(0.019, 0.013, 0.007), vec3(0.049, 0.036, 0.017), smoothstep(0.25, 0.77, bank.r));
    soil *= 0.76 + 0.51 * smoothstep(0.28, 0.77, bank.g);
    float blend = smoothstep(roadFringe, roadFringe + 0.119, min(vMapUv.x, 1.0 - vMapUv.x));
    diffuseColor.rgb = mix(soil, diffuseColor.rgb, blend);
    relief = mix(bank.g * 0.22, relief, blend);
  #endif
`;

export const PAVERS = /* glsl */`
  vec2 ground = vSurfacePosition.xz;
  float weather = texture2D(uSurfaceTile, ground * 0.097).r;
  vec2 grid = ground / vec2(0.51, 0.36) + (tex.rg - 0.5) * vec2(0.28, 0.23);
  grid.x += mod(floor(grid.y), 2.0) * 0.5;
  float block = cellVariation(floor(grid));
  float joint = stoneJoint(grid, 0.16 + 0.10 * block);
  float face = 1.0 - smoothstep(-0.073, max(0.015, fwidth(joint)), joint);
  float moss = smoothstep(0.52, 0.80, weather * 0.66 + grit * 0.22 + (1.0 - face) * 0.20);
  float sediment = 1.0 - smoothstep(0.20, 0.53, weather + (grit - 0.5) * 0.19);
  float exposed = face * (1.0 - sediment * (0.43 + 0.56 * smoothstep(0.57, 0.87, block)));
  vec3 rubble = mix(vec3(0.128, 0.103, 0.076), vec3(0.25, 0.23, 0.19), block);
  vec3 mortar = mix(vec3(0.070, 0.047, 0.025), vec3(0.058, 0.077, 0.027), moss);
  diffuseColor.rgb = mix(mortar, rubble * (0.64 + mineral * 0.51), exposed);
  relief = 0.61 * exposed + 0.25 * mineral;
`;

export const TILES = /* glsl */`
  vec3 plane = surfacePlane(vViewPosition, worldNormal);
  #ifdef SWEPT_EAVES
    vec2 metres = vRoofPanelPosition;
  #else
    vec2 metres = roofCourses(vSurfacePosition, plane);
    normal = normalize((viewMatrix * vec4(plane, 0.0)).xyz);
  #endif
  vec2 grid = metres / vec2(0.42, 0.34) + (tex.rg - 0.5) * vec2(0.045, 0.040);
  vec2 pixels = fwidth(grid);
  float detail = 1.0 - smoothstep(0.095, 0.46, max(pixels.x, pixels.y));
  vec2 tile = fract(grid);
  float variation = cellVariation(floor(grid));
  float roll = 1.0 - smoothstep(0.025, 0.27, abs(tile.x - 0.5));
  float overlap = smoothstep(0.012, 0.16, tile.y) * (1.0 - smoothstep(0.53, 0.998, tile.y));
  float lap = mix(0.90, 0.68 + 0.32 * smoothstep(0.0, 0.13, min(tile.y, 1.0 - tile.y)), detail);
  float moss = smoothstep(0.59, 0.79, tex.r * 0.72 + tex.g * 0.28);
  vec3 ceramic = diffuseColor.rgb * (1.36 + mix(0.49, variation, detail) * 0.70) + vec3(0.021, 0.020, 0.018);
  ceramic = mix(ceramic, vec3(0.055, 0.065, 0.031), moss * 0.67);
  ceramic *= (0.91 + 0.19 * mineral) * lap * mix(1.0, 0.88 + 0.33 * roll + 0.15 * overlap, detail);
  // seen from afar, when single tiles blur: patches of older, darker tiles and rain stains running down the slope
  float aged = texture2D(uSurfaceTile, metres * vec2(0.045, 0.07) + vec2(0.41, 0.17)).r;
  float runoff = texture2D(uSurfaceTile, vec2(metres.x * 0.55, metres.y * 0.04) + vec2(0.7, 0.3)).b;
  ceramic *= (0.78 + 0.42 * smoothstep(0.2, 0.8, aged)) * (1.0 - 0.22 * smoothstep(0.55, 0.85, runoff));
  float tiled = smoothstep(0.15, 0.39, plane.y);
  diffuseColor.rgb = mix(diffuseColor.rgb * clayTint, ceramic, tiled);
  relief = 0.17 * mineral + tiled * detail * (0.65 * roll + 0.44 * overlap);
`;

export const THATCH = /* glsl */`
  vec3 plane = surfacePlane(vViewPosition, worldNormal);
  normal = normalize((viewMatrix * vec4(plane, 0.0)).xyz);
  vec2 roof = roofCourses(vSurfacePosition, plane);
  float strand = texture2D(uSurfaceTile, roof * vec2(1.06, 0.29) + tex.r * 0.037).b;
  float course = roof.y / 0.43 + tex.r * 0.23;
  float band = fract(course);
  float edge = smoothstep(0.031, 0.24, band) * (1.0 - smoothstep(0.81, 1.0, band));
  float detail = 1.0 - smoothstep(0.12, 0.45, fwidth(course));
  float fade = smoothstep(0.28, 0.76, stain * 0.58 + strand * 0.42);
  float damp = smoothstep(0.58, 0.82, tex.r * 0.63 + tex.b * 0.37);
  vec3 straw = mix(vec3(0.095, 0.059, 0.023), vec3(0.27, 0.179, 0.073), fade);
  straw = mix(straw, vec3(0.077, 0.085, 0.036), damp * 0.7);
  diffuseColor.rgb = straw * (0.78 + 0.25 * edge * detail + 0.18 * grit);
  relief = 0.22 * edge * detail + 0.44 * strand + 0.19 * grit;
`;

export const SIDING = /* glsl */`
  vec3 plane = surfacePlane(vViewPosition, worldNormal);
  vec2 wall = roofProjection(vSurfacePosition, plane);
  float board = wall.x / 0.29;
  float variation = cellVariation(vec2(floor(board), floor(dot(vSurfacePosition.xz, plane.xz) / 0.9)));
  float seam = smoothstep(0.012, 0.038 + fwidth(board), abs(fract(board + 0.5) - 0.5));
  float fibre = texture2D(uSurfaceTile, vec2(wall.x * 0.53 + variation * 0.46, wall.y * 0.22 - variation * 0.2)).b;
  float wash = smoothstep(0.25, 0.81, fibre * 0.62 + stain * 0.38);
  vec3 cedar = diffuseColor.rgb * mix(vec3(0.58, 0.44, 0.33), vec3(1.77, 1.66, 1.38), wash) * (0.77 + 0.44 * variation);
  cedar = mix(cedar, cedar * vec3(0.64, 0.69, 0.75), smoothstep(0.6, 0.9, tex.r));
  float streaks = texture2D(uSurfaceTile, vec2(wall.x * 0.8 + 0.23, wall.y * 0.06)).b;
  float weathered = texture2D(uSurfaceTile, wall * 0.07 + vec2(0.52, 0.88)).r;
  cedar *= (1.0 - 0.3 * smoothstep(0.52, 0.82, streaks)) * (0.8 + 0.4 * weathered);
  diffuseColor.rgb = mix(diffuseColor.rgb * woodTint, cedar * (0.45 + seam * 0.55), 1.0 - abs(plane.y));
  relief = 0.34 * fibre + 0.31 * seam + 0.14 * stain;
`;

export const PLASTER = /* glsl */`
  float weather = surfaceSample(vSurfacePosition * 0.13, worldNormal).r;
  float rain = surfaceSample(vSurfacePosition * vec3(1.1, 0.13, 1.1), worldNormal).b;
  float stainMask = smoothstep(0.34, 0.72, weather * 0.57 + rain * 0.43);
  float crack = fissure * smoothstep(0.42, 0.72, weather) * smoothstep(0.26, 0.72, grit);
  vec3 aged = mix(vec3(0.76, 0.715, 0.615), vec3(0.30, 0.25, 0.18), stainMask);
  diffuseColor.rgb *= aged * (0.85 + grit * 0.23 - 0.31 * crack);
  relief = 0.4 * grit + 0.3 * stain - 0.3 * crack;
`;

export const MASONRY = /* glsl */`
  vec3 plane = surfacePlane(vViewPosition, worldNormal);
  vec2 face = roofProjection(vSurfacePosition, plane);
  vec2 grid = face / vec2(0.86, 0.49) + (tex.rg - 0.5) * vec2(0.42, 0.35);
  grid.x += mod(floor(grid.y), 2.0) * 0.5;
  float block = cellVariation(floor(grid));
  float crack = stoneJoint(grid, 0.17 + block * 0.10);
  float ashlar = 1.0 - smoothstep(-0.085, max(0.025, fwidth(crack)), crack);
  float lichen = smoothstep(0.58, 0.79, stain * 0.56 + grit * 0.31 + (1.0 - ashlar) * 0.20);
  vec3 stone = diffuseColor.rgb * stoneTint * (0.88 + 0.91 * block) + vec3(0.014, 0.012, 0.009);
  stone = mix(stone, vec3(0.059, 0.073, 0.030), lichen * 0.64);
  diffuseColor.rgb = mix(vec3(0.029, 0.024, 0.016), stone, ashlar);
  relief = 0.61 * ashlar + 0.22 * mineral;
`;

// ------------------------------------------------------------ text view
// The ASCII pass has no use for normal maps, so each finish gets a coarse version painted straight into
// the colour: tile rows, boards, ashlar and straw courses big enough to span several character cells,
// fading out (to the broad weathering underneath) before they get small enough to shimmer.
const ASCII_COMMON = /* glsl */`
  float asciiFade(vec2 grid) { vec2 w = fwidth(grid); return 1.0 - smoothstep(0.08, 0.2, max(w.x, w.y)); }
  vec2 asciiFade2(vec2 grid) { vec2 w = fwidth(grid); return 1.0 - smoothstep(vec2(0.08), vec2(0.2), w); }
`;
export const ASCII_HELPERS = ASCII_COMMON;

/** broad weathering everywhere: blotches of age, rain streaks running down the walls */
const ASCII_AGE = /* glsl */`
  float asciiAge = texture2D(uSurfaceTile, (vSurfacePosition.xz + vSurfacePosition.y * 0.37) * 0.045 + vec2(0.13, 0.71)).r;
  float asciiRain = texture2D(uSurfaceTile, vec2(dot(vSurfacePosition.xz, vec2(0.71, 0.71)) * 0.7, vSurfacePosition.y * 0.05)).b;
`;

export const ASCII_TILES = (swept: boolean) => ASCII_AGE + /* glsl */`
  vec3 plane = surfacePlane(vViewPosition, worldNormal);
  vec2 metres = ${swept ? 'vRoofPanelPosition' : 'roofCourses(vSurfacePosition, plane)'};
  vec2 grid = metres / vec2(0.42, 0.34);
  vec2 detail = asciiFade2(grid) * smoothstep(0.15, 0.39, plane.y);
  float roll = 1.0 - smoothstep(0.08, 0.36, abs(fract(grid.x) - 0.5));       // the round cover tiles
  float lap = smoothstep(0.0, 0.25, fract(grid.y));                          // the shadow under each course
  float variation = cellVariation(floor(grid));
  float shade = mix(1.0, mix(0.5, 1.2, roll), detail.x) * mix(1.0, mix(0.55, 1.0, lap) * (0.88 + 0.24 * variation), detail.y);
  diffuseColor.rgb *= shade * (0.84 + 0.3 * asciiAge);
`;

export const ASCII_THATCH = ASCII_AGE + /* glsl */`
  vec3 plane = surfacePlane(vViewPosition, worldNormal);
  vec2 roof = roofCourses(vSurfacePosition, plane);
  float course = roof.y / 0.43 + asciiAge * 0.3;
  float detail = asciiFade2(vec2(course, 0.0)).x;
  float strand = texture2D(uSurfaceTile, roof * vec2(0.9, 0.2)).b;
  float shade = (0.62 + 0.5 * smoothstep(0.0, 0.75, fract(course))) * (0.8 + 0.4 * strand);
  diffuseColor.rgb *= mix(0.9 + 0.2 * strand, shade, detail) * (0.85 + 0.3 * asciiAge);
`;

export const ASCII_SIDING = ASCII_AGE + /* glsl */`
  vec3 plane = surfacePlane(vViewPosition, worldNormal);
  vec2 wall = roofProjection(vSurfacePosition, plane);
  float board = wall.x / 0.29;
  float detail = asciiFade2(vec2(board, 0.0)).x * (1.0 - abs(plane.y));
  float seam = smoothstep(0.04, 0.14, abs(fract(board + 0.5) - 0.5));
  float variation = cellVariation(vec2(floor(board), floor(wall.y / 1.7)));
  float shade = mix(0.4, 1.25 + 0.5 * variation, seam);
  diffuseColor.rgb *= mix(1.0, shade, detail) * (0.86 + 0.26 * asciiAge) * (1.0 - 0.16 * smoothstep(0.55, 0.8, asciiRain));
  // the dark cedar in shadow sinks into black at night: a faint glow of its own keeps the boards
  // readable (the ASCII relief engine shades the wall again from the depth buffer)
  asciiLift = vec3(0.17, 0.135, 0.11) * mix(1.0, shade, detail) * (0.8 + 0.4 * asciiAge);
`;

export const ASCII_PLASTER = ASCII_AGE + /* glsl */`
  float blot = surfaceSample(vSurfacePosition * 0.21, inverseTransformDirection(normal, viewMatrix)).r;
  float streak = smoothstep(0.5, 0.78, asciiRain);
  diffuseColor.rgb *= (0.8 + 0.3 * blot) * (1.0 - 0.26 * streak) * (0.9 + 0.16 * asciiAge);
`;

export const ASCII_MASONRY = ASCII_AGE + /* glsl */`
  vec3 plane = surfacePlane(vViewPosition, worldNormal);
  vec2 grid = roofProjection(vSurfacePosition, plane) / vec2(0.86, 0.49);
  grid.x += mod(floor(grid.y), 2.0) * 0.5;
  float detail = asciiFade(grid);
  float block = cellVariation(floor(grid));
  float ashlar = 1.0 - smoothstep(-0.07, 0.03, stoneJoint(grid, 0.13));
  diffuseColor.rgb *= mix(0.92 + 0.16 * block, mix(0.42, 0.78 + 0.44 * block, ashlar), detail) * (0.84 + 0.3 * asciiAge);
`;

export const ASCII_WOOD = ASCII_AGE + /* glsl */`
  float fibre = surfaceSample(vSurfacePosition * vec3(1.2, 0.25, 1.2), inverseTransformDirection(normal, viewMatrix)).b;
  diffuseColor.rgb *= (0.78 + 0.42 * fibre) * (0.88 + 0.22 * asciiAge);
`;

export const ASCII_MOTTLE = ASCII_AGE + /* glsl */`
  diffuseColor.rgb *= 0.8 + 0.38 * asciiAge;
`;
