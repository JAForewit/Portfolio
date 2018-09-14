/**
 * @fileoverview gl-scene - Simple and quick webgl scene creator
 * @author Marc Anderson
 * @version 1.0
 *
 * Inspired by: https://github.com/sessamekesh/IndigoCS-webgl-tutorials
 * Requires glMatrix: https://github.com/toji/gl-matrix
 */

/* Copyright (c) 2018, Marc Anderson.
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

/* GLOBAL COORDINATES (SAME AS WEBGL):
           +y
            |    -z (in)
            |   /
            | /
  -x - - - - - - - - +x
           /|
         /  |
(out) +z    |
           -y
ALL ANGLES ARE IN DEGREES */

// Good light attenuation: [1.0, 0.045, 0.0075]

const geoVertexShaderText =
    `#version 300 es

layout(std140, column_major) uniform;

layout(location=0) in vec4 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aUV;

uniform Matrices {
    mat4 uModelMatrix;
    mat4 uMVP;
};

out vec4 vPosition;
out vec4 vNormal;
out vec4 vUV;

void main() {
    vPosition = uModelMatrix * aPosition;
    vNormal = uModelMatrix * vec4(aNormal, 0.0);
    vUV = aUV;
    gl_Position = uMVP * aPosition;
}`;

const geoFragmentShaderText =
    `#version 300 es
precision highp float;

in vec4 vPosition;
in vec4 vNormal; 
in vec4 vUV;

layout(location=0) out vec4 fragPosition;
layout(location=1) out vec4 fragNormal;
layout(location=2) out vec4 fragUV; 

void main() {
    fragPosition = vPosition;
    fragNormal = vec4(normalize(vNormal.xyz), 0.0);
    fragUV = vUV;
}`;

const mainVertexShaderText =
    `#version 300 es
layout(std140, column_major) uniform;

layout(location=0) in vec4 aPosition;

uniform LightUniforms {
    mat4 mvp;
    vec4 position;
    vec4 color;
} uLight; 

void main() {
    gl_Position = uLight.mvp * aPosition;
}`;

const mainFragmentShaderText =
    `#version 300 es
precision highp float;

uniform LightUniforms {
    mat4 mvp; //projection * view * model
    vec4 position;
    vec4 color;
} uLight; 

uniform vec3 uEyePosition;

uniform sampler2D uPositionBuffer;
uniform sampler2D uNormalBuffer;
uniform sampler2D uUVBuffer;
uniform sampler2D uTextureMap;

out vec4 fragColor;

void main() {
    ivec2 fragCoord = ivec2(gl_FragCoord.xy);
    vec3 position = texelFetch(uPositionBuffer, fragCoord, 0).xyz;
    vec3 normal = normalize(texelFetch(uNormalBuffer, fragCoord, 0).xyz);
    vec2 uv = texelFetch(uUVBuffer, fragCoord, 0).xy;

    vec4 baseColor = texture(uTextureMap, uv);

    vec3 eyeDirection = normalize(uEyePosition - position);
    vec3 lightVec = uLight.position.xyz - position;
    float attenuation = 1.0 - length(lightVec);
    vec3 lightDirection = normalize(lightVec);
    vec3 reflectionDirection = reflect(-lightDirection, normal);
    float nDotL = max(dot(lightDirection, normal), 0.0);
    vec3 diffuse = nDotL * uLight.color.rgb;
    float ambient = 0.1;
    vec3 specular = pow(max(dot(reflectionDirection, eyeDirection), 0.0), 20.0) * uLight.color.rgb;

    fragColor = vec4(attenuation * (ambient + diffuse + specular) * baseColor.rgb, baseColor.a);
}`;
// TODO: overload the add models function (depending of number of textuers)
// TODO: Move Material information to the model instead of the scene

/**
 * @class Webgl 3D scene containing models, cameras, and phong lighting with
 * point, spot, and directional lights.
 * @name Scene 
 * 
 * @param {HTML Canvas} canvas Webgl context
 * @param {Object} options Allows for customization of default settings
 */
var canvas = document.getElementById("webgl-surface");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

var gl = canvas.getContext("webgl2");
if (!gl) {
    console.error("WebGL 2 not available");
    document.body.innerHTML = "This example requires WebGL 2 which is unavailable on this system."
}

gl.clearColor(0.0, 0.0, 0.0, 1.0);
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.blendFunc(gl.ONE, gl.ONE);

if (!gl.getExtension("EXT_color_buffer_float")) {
    console.error("FLOAT color buffer not available");
    document.body.innerHTML = "This example requires EXT_color_buffer_float which is unavailable on this system."
}

////////////////////////////
// GBUFFER PROGRAM SETUP
////////////////////////////
var geoVertexShader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(geoVertexShader, geoVertexShaderText);
gl.compileShader(geoVertexShader);

if (!gl.getShaderParameter(geoVertexShader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(geoVertexShader));
}

var geoFragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(geoFragmentShader, geoFragmentShaderText);
gl.compileShader(geoFragmentShader);

if (!gl.getShaderParameter(geoFragmentShader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(geoFragmentShader));
}

var geoProgram = gl.createProgram();
gl.attachShader(geoProgram, geoVertexShader);
gl.attachShader(geoProgram, geoFragmentShader);
gl.linkProgram(geoProgram);

if (!gl.getProgramParameter(geoProgram, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(geoProgram));
}

//////////////////////////////////////////
// GET GBUFFFER PROGRAM UNIFORM LOCATIONS
//////////////////////////////////////////

var matrixUniformLocation = gl.getUniformBlockIndex(geoProgram, "Matrices");
gl.uniformBlockBinding(geoProgram, matrixUniformLocation, 0);


////////////////////////////
// GBUFFER SETUP
////////////////////////////

var gBuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, gBuffer);

gl.activeTexture(gl.TEXTURE0);

var positionTarget = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, positionTarget);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, gl.drawingBufferWidth, gl.drawingBufferHeight);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, positionTarget, 0);

var normalTarget = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, normalTarget);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, gl.drawingBufferWidth, gl.drawingBufferHeight);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, normalTarget, 0);

var uvTarget = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, uvTarget);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG16F, gl.drawingBufferWidth, gl.drawingBufferHeight);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, uvTarget, 0);

var depthTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, depthTexture);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT16, gl.drawingBufferWidth, gl.drawingBufferHeight);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);

gl.drawBuffers([
    gl.COLOR_ATTACHMENT0,
    gl.COLOR_ATTACHMENT1,
    gl.COLOR_ATTACHMENT2
]);


gl.bindFramebuffer(gl.FRAMEBUFFER, null);

/////////////////////////////
// MAIN PROGRAM SETUP
/////////////////////////////
var mainVertexShader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(mainVertexShader, mainVertexShaderText);
gl.compileShader(mainVertexShader);

if (!gl.getShaderParameter(mainVertexShader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(mainVertexShader));
}

var mainFragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(mainFragmentShader, mainFragmentShaderText);
gl.compileShader(mainFragmentShader);

if (!gl.getShaderParameter(mainFragmentShader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(mainFragmentShader));
}

var mainProgram = gl.createProgram();
gl.attachShader(mainProgram, mainVertexShader);
gl.attachShader(mainProgram, mainFragmentShader);
gl.linkProgram(mainProgram);

if (!gl.getProgramParameter(mainProgram, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(mainProgram));
}

//////////////////////////////////////////////
// GET MAIN PROGRAM UNIFORM LOCATIONS
//////////////////////////////////////////////

var lightUniformsLocation = gl.getUniformBlockIndex(mainProgram, "LightUniforms");
gl.uniformBlockBinding(mainProgram, lightUniformsLocation, 0);

var eyePositionLocation = gl.getUniformLocation(mainProgram, "uEyePosition");

var positionBufferLocation = gl.getUniformLocation(mainProgram, "uPositionBuffer");
var normalBufferLocation = gl.getUniformLocation(mainProgram, "uNormalBuffer");
var uVBufferLocation = gl.getUniformLocation(mainProgram, "uUVBuffer");
var textureMapLocation = gl.getUniformLocation(mainProgram, "uTextureMap");

///////////////////////
// GEOMETRY SET UP
///////////////////////
var start = function () {
    
    var cubeVertexArray = gl.createVertexArray();
    gl.bindVertexArray(cubeVertexArray);

    var box = utils.createBox();
    box = {
        positions: models[0].vertices,
        normals: models[0].normals,
        uvs: models[0].texCoords
    }

    var positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(box.positions), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, gl.FALSE, 3 * Float32Array.BYTES_PER_ELEMENT, 0);
    gl.enableVertexAttribArray(0);

    var normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(box.normals), gl.STATIC_DRAW);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, gl.FALSE, 3 * Float32Array.BYTES_PER_ELEMENT, 0);
    gl.enableVertexAttribArray(1);

    var uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(box.uvs), gl.STATIC_DRAW);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, gl.FALSE, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
    gl.enableVertexAttribArray(2);

    var sphereVertexArray = gl.createVertexArray();
    gl.bindVertexArray(sphereVertexArray);

    var numCubeVertices = box.positions.length / 3;
    console.log(numCubeVertices);

    var sphere = utils.createSphere();

    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sphere.positions, gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    var indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sphere.indices, gl.STATIC_DRAW);

    var numSphereElements = sphere.indices.length;

    gl.bindVertexArray(null);


    ////////////////////
    // UNIFORM DATA
    ////////////////////

    var viewProjMatrix = camera.getViewProjMatrix();

    var boxes = [
        {
            scale: [1, 1, 1],
            rotate: [0, 0, 0],
            translate: [0, 0, 0],
            modelMatrix: mat4.create(),
            mvpMatrix: mat4.create(),
        },
    ];

    var matrixUniformData = new Float32Array(32);
    var matrixUniformBuffer = gl.createBuffer();
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, matrixUniformBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, 128, gl.DYNAMIC_DRAW);

    var lights = [
        {
            position: vec3.fromValues(1.5,0,0),
            color: vec3.fromValues(0.8, 0.0, 0.0),
            uniformData: new Float32Array(24),
            uniformBuffer: gl.createBuffer()
        },
        {
            position: vec3.fromValues(-1.5, 0, 0),
            color: vec3.fromValues(0.0, 0.0, 0.8),
            uniformData: new Float32Array(24),
            uniformBuffer: gl.createBuffer()
        },
        {
            position: vec3.fromValues(0, 1.5, 0),
            color: vec3.fromValues(0.0, 0.8, 0.0),
            uniformData: new Float32Array(24),
            uniformBuffer: gl.createBuffer()
        },
        {
            position: vec3.fromValues(0, 0, 1.5),
            color: vec3.fromValues(0.0, 0.8, 0.8),
            uniformData: new Float32Array(24),
            uniformBuffer: gl.createBuffer()
        }
    ];

    var mvpMatrix = mat4.create();
    for (var i = 0, len = lights.length; i < len; ++i) {
        utils.xformMatrix(mvpMatrix, lights[i].position);
        mat4.multiply(mvpMatrix, viewProjMatrix, mvpMatrix);
        lights[i].uniformData.set(mvpMatrix);
        lights[i].uniformData.set(lights[i].position, 16);
        lights[i].uniformData.set(lights[i].color, 20);

        gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, lights[i].uniformBuffer);
        gl.bufferData(gl.UNIFORM_BUFFER, lights[i].uniformData, gl.STATIC_DRAW);
    }

    var image = new Image();

    image.onload = function () {
        var colorTexture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, colorTexture);

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

        var levels = Math.floor(Math.log2(Math.max(this.width, this.height))) + 1;
        gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, image.width, image.height);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, image.width, image.height, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.generateMipmap(gl.TEXTURE_2D);

        //////////////////
        // BIND TEXTURES
        //////////////////

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, positionTarget);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, normalTarget);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, uvTarget);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, colorTexture);

        //////////////////////////////
        // SET MAIN PROGRAM UNIFORMS
        //////////////////////////////

        gl.useProgram(mainProgram);
        gl.uniform3fv(eyePositionLocation, camera.position);
        gl.uniform1i(positionBufferLocation, 0);
        gl.uniform1i(normalBufferLocation, 1);
        gl.uniform1i(uVBufferLocation, 2);
        gl.uniform1i(textureMapLocation, 3);

        function draw() {

            /////////////////////////
            // DRAW TO GBUFFER
            /////////////////////////

            gl.bindFramebuffer(gl.FRAMEBUFFER, gBuffer);
            gl.useProgram(geoProgram);
            gl.bindVertexArray(cubeVertexArray);
            gl.depthMask(true);
            gl.disable(gl.BLEND);

            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            for (var i = 0, len = boxes.length; i < len; ++i) {
                boxes[i].rotate[0] += 0.01;
                boxes[i].rotate[1] += 0.02;

                utils.xformMatrix(boxes[i].modelMatrix, boxes[i].translate, boxes[i].rotate, boxes[i].scale);
                mat4.multiply(boxes[i].mvpMatrix, viewProjMatrix, boxes[i].modelMatrix);

                matrixUniformData.set(boxes[i].modelMatrix);
                matrixUniformData.set(boxes[i].mvpMatrix, 16);

                gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, matrixUniformBuffer);
                gl.bufferSubData(gl.UNIFORM_BUFFER, 0, matrixUniformData);

                gl.drawArrays(gl.TRIANGLES, 0, numCubeVertices);
            }

            /////////////////////////
            // MAIN DRAW PASS
            /////////////////////////

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.useProgram(mainProgram);
            gl.bindVertexArray(sphereVertexArray);
            gl.depthMask(false);
            gl.enable(gl.BLEND);


            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            for (var i = 0, len = lights.length; i < len; ++i) {
                gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, lights[i].uniformBuffer);
                gl.drawElements(gl.TRIANGLES, numSphereElements, gl.UNSIGNED_SHORT, 0);
            }

            requestAnimationFrame(draw);
        }

        requestAnimationFrame(draw);

    }

    image.src = "./img/khronos_webgl.png";
};