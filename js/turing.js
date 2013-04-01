var gl;

var SCALE_DEFS = [
  {aRadius: 50, iRadius: 100, delta: 0.05, numSym: 2},
  {aRadius: 10, iRadius: 20, delta: 0.04, numSym: 2},
  {aRadius: 5, iRadius: 10, delta: 0.03, numSym: 2},
  {aRadius: 2, iRadius: 4, delta: 0.02, numSym: 2}
];

var scales = SCALE_DEFS.slice(0);

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

var scaleSamplers, deltas;
var symMatrices, symsUsed, maxSyms;
var initScales = function() {
  scaleSamplers = [], deltas = [], maxSyms = 0;
  for (var i = 0; i < scales.length; i++) {
    scaleSamplers.push(i);
    deltas.push(scales[i].delta);
    maxSyms = Math.max(maxSyms, scales[i].numSym);
  }

  symMatrices = [], symsUsed = [];
  scales.forEach(function(s) {
    symMatrices = symMatrices.concat(getSymMatrices(s.numSym, maxSyms));
    symsUsed = symsUsed.concat(getSymsUsed(s.numSym, maxSyms));
  });
};
initScales();

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
    source = Mustache.render(source, renderData);
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

var updateShader;
var initUpdateProgram = function(program) {
  if (updateShader) {
    gl.detachShader(program, updateShader);
    gl.deleteShader(updateShader);
  }

  updateShader = getShader(gl, "frag-update", {
    numScales: scales.length,
    maxSyms: maxSyms
  });
  gl.attachShader(program, updateShader);

  initProgram(program);
  program.scaleSamplersUniform = gl.getUniformLocation(
      program, "uScaleSamplers");
  program.deltasUniform = gl.getUniformLocation(program, "uDeltas");
  program.symMatricesUniform = gl.getUniformLocation(
      program, "uSymMatrices");
  program.symsUsedUniform = gl.getUniformLocation(
      program, "uSymsUsed");
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

  updateProgram = gl.createProgram();
  gl.attachShader(updateProgram, vertexShader);
  initUpdateProgram(updateProgram);

  fragmentShader = getShader(gl, "frag-draw");
  drawProgram = gl.createProgram();
  gl.attachShader(drawProgram, vertexShader);
  gl.attachShader(drawProgram, fragmentShader);

  initProgram(drawProgram);
  drawProgram.samplerUniform = gl.getUniformLocation(drawProgram, "uSampler");
  drawProgram.rgbUniform = gl.getUniformLocation(drawProgram, "uRGB");
  drawProgram.useHueUniform = gl.getUniformLocation(drawProgram, "uUseHue");
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

  if (target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, target, 0);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
  gl.uniformMatrix3fv(updateProgram.symMatricesUniform, false, symMatrices);
  gl.uniform1iv(updateProgram.symsUsedUniform, symsUsed);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexPositionBuffer.numItems);

  prepProgram(drawProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gridTexture);
  gl.uniform1i(drawProgram.samplerUniform, 0);
  gl.uniform3f(drawProgram.rgbUniform, rgb[0], rgb[1], rgb[2]);
  gl.uniform1i(drawProgram.useHueUniform, useHue);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexPositionBuffer.numItems);
};

var requestAnimationFrame = 
  window.requestAnimationFrame ||
  window.mozRequestAnimationFrame ||
  window.webkitRequestAnimationFrame ||
  window.msRequestAnimationFrame;

var lastFrame = new Date();
var lastFPSUpdate = 0;
var tick = function() {
  drawScene();

  var now = new Date();
  var fps = (1000 / (now - lastFrame)).toFixed(1);
  if (now - lastFPSUpdate > 1000) {
    document.querySelector("#fps span").textContent = fps;
    lastFPSUpdate = now;
  }
  lastFrame = now;

  requestAnimationFrame(tick);
};

var removeScale = function(index) {
  index = scales.indexOf(SCALE_DEFS[index]);
  scales.splice(index, 1);
  initScales();
  initUpdateProgram(updateProgram);
};

var addScale = function(index) {
  scales.push(SCALE_DEFS[index]);
  initScales();
  initUpdateProgram(updateProgram);
};

var rgb = [1, 1, 1], useHue = false;
var initSettings = function() {
  var details = document.querySelector("header details");
  details.addEventListener("click", function(event) {
    event.stopPropagation();
  });

  var scaleChecks = details.querySelectorAll('input[type="checkbox"]');
  Array.prototype.forEach.call(scaleChecks, function(check) {
    check.addEventListener("change", function() {
      var checked = details.querySelectorAll('input[type="checkbox"]:checked');
      if (checked.length == 0) {
        check.checked = true;
      } else if (check.checked) {
        addScale(Number(check.dataset.index));
      } else {
        removeScale(Number(check.dataset.index));
      }
    });
  });

  var colors = details.querySelectorAll(".color");
  Array.prototype.forEach.call(colors, function(color) {
    color.addEventListener("click", function() {
      if (color.classList.contains("hue")) {
        useHue = true;
      } else {
        useHue = false;
      }

      if (color.classList.contains("white")) {
        rgb = [1, 1, 1];
      } else if (color.classList.contains("red")) {
        rgb = [1, 0, 0];
      } else if (color.classList.contains("green")) {
        rgb = [0, 1, 0];
      } else if (color.classList.contains("blue")) {
        rgb = [0, 0, 1];
      } else if (color.classList.contains("yellow")) {
        rgb = [1, 1, 0];
      } else if (color.classList.contains("magenta")) {
        rgb = [1, 0, 1];
      } else if (color.classList.contains("cyan")) {
        rgb = [0, 1, 1];
      }
    });
  });
};

var main = function() {
  var canvas = document.querySelector("canvas.main");
  initWebGl(canvas);
  if (!gl) return;

  initShaders();
  initBuffers();
  initFramebufferTextures();
  initSettings();

  resizeCanvas();
  tick();
};

window.addEventListener("resize", function() {
  resizeCanvas();
  drawScene();
});


document.addEventListener("click", function(event) {
  var header = document.querySelector("header");
  header.style.display = header.style.display != "none"? "none" : "";
});
