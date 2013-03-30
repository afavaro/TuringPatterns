var gl;

var scales = [
  {aRadius: 50, iRadius: 100, delta: 0.05, numSym: 3},
  {aRadius: 10, iRadius: 20, delta: 0.04, numSym: 2},
  {aRadius: 5, iRadius: 10, delta: 0.03, numSym: 2},
  {aRadius: 2, iRadius: 4, delta: 0.02, numSym: 2},
  {aRadius: 1, iRadius: 2, delta: 0.01, numSym: 2}
];

var scaleSamplers = [], deltas = [];
for (var i = 0; i < scales.length; i++) {
  scaleSamplers.push(i);
  deltas.push(scales[i].delta);
}

var boxBlurWeights = function(radius) {
  var weights = [];
  for (var i = 0; i < radius; i ++) {
    weights.push(1 / (radius * 2));
  }
  return weights;
};

var boxBlurOffsets = function(radius) {
  var offsets = [0];
  for (var i = 1; i < radius; i++) {
    offsets.push(i * 2 - 0.5);
  }
  return offsets;
};

var getSymMatrices = function(numSym, maxSym) {
  var matrices = [];
  for (var i = 1; i < maxSym; i++) {
    if (i < numSym) {
      var th = i / numSym * 2 * Math.PI;
      var costh = Math.cos(th);
      var sinth = Math.sin(th);
      matrices = matrices.concat([
          costh, sinth, 0,
          -sinth, costh, 0,
          0.5 * (1 - costh + sinth), 0.5 * (1 - sinth - costh), 1
      ]);
    } else {
      matrices = matrices.concat([
          0, 0, 0,
          0, 0, 0,
          0, 0, 0
      ]);
    }
  }
  return matrices;
};

var getSymsUsed = function(numSym, maxSym) {
  var used = [];
  for (var i = 1; i < maxSym; i++) {
    used.push(i < numSym);
  }
  return used;
};

var maxSyms = scales[0].numSym;
scales.forEach(function(s) {
  s.aOffsets = boxBlurOffsets(s.aRadius);
  s.aWeights = boxBlurWeights(s.aRadius);
  s.iOffsets = boxBlurOffsets(s.iRadius);
  s.iWeights = boxBlurWeights(s.iRadius);
  maxSyms = Math.max(maxSyms, s.numSym);
});

var symMatrices = [], symsUsed = [];
scales.forEach(function(s) {
  symMatrices = symMatrices.concat(getSymMatrices(s.numSym, maxSyms));
  symsUsed = symsUsed.concat(getSymsUsed(s.numSym, maxSyms));
});

var blurWeightOffsets = function(radius) {
  var extraLevels = Math.floor(radius * 2 / 3);

  var p, weights = [1];
  for (p = 1; p <= radius * 2 + extraLevels; p++) {
    var newWeights = [1];
    for (var i = 0; i < weights.length - 1; i++) {
      newWeights.push(weights[i] + weights[i + 1]);
    }
    newWeights.push(1);
    weights = newWeights;
  }

  var extras = Math.ceil((extraLevels + 1) / 2);
  weights = weights.slice(extras, -extras);
  var sum = weights.reduce(function(prev, cur) { return prev + cur; });
  weights = weights
    .slice(0, Math.ceil(weights.length / 2))
    .map(function(w) { return w / sum; })
    .reverse();

  var linWeights = weights.length % 2? [weights[0]] : [];
  var offsets = weights.length % 2? [0] : [];
  for (var i = weights.length % 2; i < weights.length - 1; i += 2) {
    var lw = weights[i] + weights[i + 1];
    linWeights.push(lw);
    offsets.push((i * weights[i] + (i + 1) * weights[i + 1]) / lw);
  }

  return [linWeights, offsets];
};

var getRandomInt = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

var getShader = function(gl, id, renderData) {
  var shaderScript = document.getElementById(id);
  if (!shaderScript) return null;

  var source = "", child = shaderScript.firstChild;
  while (child) {
    if (child.nodeType == child.TEXT_NODE) {
      source += child.textContent;
    }
    child = child.nextSibling;
  }

  if (renderData) {
    source = Handlebars.compile(source)(renderData);
  }

  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }

  return shader;
};

var textures;
var initWebGl = function(canvas) {
  try {
    gl = canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
  } catch(e) {}

  if (gl) {
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    textures = [
      gl.TEXTURE0,
      gl.TEXTURE1,
      gl.TEXTURE2,
      gl.TEXTURE3,
      gl.TEXTURE4,
      gl.TEXTURE5
    ];
  }
};

var initProgram = function(program) {
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      alert("Could not initialise shaders");
    }

    program.vertexPositionAttribute = gl.getAttribLocation(
      program, "aVertexPosition");
    gl.enableVertexAttribArray(program.vertexPositionAttribute);

    program.textureCoordAttribute = gl.getAttribLocation(
      program, "aTextureCoord");
    gl.enableVertexAttribArray(program.textureCoordAttribute);
};

var updateProgram, drawProgram;
var initShaders = function() {
  var vertexShader = getShader(gl, "vertex-shader");

  var fragmentShader;
  scales.forEach(function(scale) {
    fragmentShader = getShader(gl, "frag-hblur", scale);
    scale.hblurProgram = gl.createProgram();
    gl.attachShader(scale.hblurProgram, vertexShader);
    gl.attachShader(scale.hblurProgram, fragmentShader);

    fragmentShader = getShader(gl, "frag-vblur", scale);
    scale.vblurProgram = gl.createProgram();
    gl.attachShader(scale.vblurProgram, vertexShader);
    gl.attachShader(scale.vblurProgram, fragmentShader);

    [scale.hblurProgram, scale.vblurProgram].forEach(function(program) {
      initProgram(program);
      program.samplerUniform = gl.getUniformLocation(program, "uSampler");
      program.texelSizeUniform = gl.getUniformLocation(program, "uTexelSize");
    });
  });

  fragmentShader = getShader(gl, "frag-update", {
    numScales: scales.length,
    maxSyms: maxSyms
  });
  updateProgram = gl.createProgram();
  gl.attachShader(updateProgram, vertexShader);
  gl.attachShader(updateProgram, fragmentShader);

  initProgram(updateProgram);
  updateProgram.scaleSamplersUniform = gl.getUniformLocation(
      updateProgram, "uScaleSamplers");
  updateProgram.deltasUniform = gl.getUniformLocation(updateProgram, "uDeltas");
  updateProgram.symMatricesUniform = gl.getUniformLocation(
      updateProgram, "uSymMatrices");

  fragmentShader = getShader(gl, "frag-draw");
  drawProgram = gl.createProgram();
  gl.attachShader(drawProgram, vertexShader);
  gl.attachShader(drawProgram, fragmentShader);

  initProgram(drawProgram);
  drawProgram.samplerUniform = gl.getUniformLocation(drawProgram, "uSampler");
};

var vertexPositionBuffer, textureCoordBuffer;
var initBuffers = function() {
  vertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
  var vertices = [
    1.0, 1.0,
    -1.0, 1.0,
    1.0, -1.0,
    -1.0, -1.0
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  vertexPositionBuffer.itemSize = 2;
  vertexPositionBuffer.numItems = vertices.length / 2;

  textureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  var textureCoords = [
    1.0, 1.0,
    0.0, 1.0,
    1.0, 0.0,
    0.0, 0.0
  ];
  gl.bufferData(
      gl.ARRAY_BUFFER, new Float32Array(textureCoords), gl.STATIC_DRAW);
  textureCoordBuffer.itemSize = 2;
};

var textureWidth = 1024, textureHeight = 512;
var initTexture = function(texture, data) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureWidth, textureHeight, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
};

var framebuffer, gridTexture;
var initFramebufferTextures = function() {
  framebuffer = gl.createFramebuffer();

  scales.forEach(function(scale) {
    scale.hblurTexture = gl.createTexture();
    initTexture(scale.hblurTexture, null);

    scale.vblurTexture = gl.createTexture();
    initTexture(scale.vblurTexture, null);
  });

  var grid = [];
  for (var i = 0; i < textureWidth * textureHeight; i++) {
    var val = getRandomInt(0, 256);
    grid.push(val);
    grid.push(val);
    grid.push(val);
    grid.push(255);
  }
  gridTexture = gl.createTexture();
  initTexture(gridTexture, new Uint8Array(grid));

  gl.bindTexture(gl.TEXTURE_2D, null);
};

var resizeCanvas = function() {
  var canvas = document.querySelector("canvas.main");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
};

var prepProgram = function(program, target) {
  gl.useProgram(program);

  if (program == drawProgram) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, target, 0);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
  gl.vertexAttribPointer(program.vertexPositionAttribute,
    vertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  gl.vertexAttribPointer(program.textureCoordAttribute,
    textureCoordBuffer.itemSize, gl.FLOAT, false, 0, 0);
};

var texelSize = [1.0 / textureWidth, 1.0 / textureHeight];
var drawScene = function() {
  scales.forEach(function(scale) {
    prepProgram(scale.hblurProgram, scale.hblurTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gridTexture);
    gl.uniform1i(scale.hblurProgram.samplerUniform, 0);
    gl.uniform2fv(
      scale.hblurProgram.texelSizeUniform, new Float32Array(texelSize));

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexPositionBuffer.numItems);

    prepProgram(scale.vblurProgram, scale.vblurTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scale.hblurTexture);
    gl.uniform1i(scale.vblurProgram.samplerUniform, 0);
    gl.uniform2fv(
      scale.vblurProgram.texelSizeUniform, new Float32Array(texelSize));

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexPositionBuffer.numItems);
  });

  prepProgram(updateProgram, gridTexture);

  for (var i = 0; i < scales.length; i++) {
    gl.activeTexture(textures[i]);
    gl.bindTexture(gl.TEXTURE_2D, scales[i].vblurTexture);
  }
  gl.uniform1iv(updateProgram.scaleSamplersUniform, scaleSamplers);
  gl.uniform1fv(updateProgram.deltasUniform, deltas);
  gl.uniformMatrix3fv(updateProgram.symMatricesUniform, symMatrices);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexPositionBuffer.numItems);

  prepProgram(drawProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gridTexture);
  gl.uniform1i(drawProgram.samplerUniform, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexPositionBuffer.numItems);
};

var requestAnimationFrame = 
  window.requestAnimationFrame ||
  window.mozRequestAnimationFrame ||
  window.webkitRequestAnimationFrame ||
  window.msRequestAnimationFrame;

var fps = 20, mspf = 1000 / fps;
var lastFrame = new Date();
var tick = function() {
  var now = new Date();
  var dFrame = now - lastFrame;

  //if (dFrame > mspf) {
    drawScene();
    lastFrame = now - (dFrame % mspf);
  //}

  requestAnimationFrame(tick);
};

var main = function() {
  var canvas = document.querySelector("canvas.main");
  initWebGl(canvas);
  if (!gl) return;

  initShaders();
  initBuffers();
  initFramebufferTextures();

  resizeCanvas();
  tick();
};

window.addEventListener("resize", function() {
  resizeCanvas();
  drawScene();
});
