'use strict';

var scene;

var init = function () {
    var canvas = document.getElementById('webgl-surface');
    scene = new Scene(canvas);

    var camera = new Camera(
        glMatrix.toRadian(45),
		canvas.clientWidth / canvas.clientHeight,
		0.1,
        100.0
	);
    camera.orient(
        [0,0,5],
        [0,0,0],
        [0,1,0]
    );
    var dirLight = new DirLight(
        [-0.2, -1, -0.2],
        [0.2, 0.2, 0.2],
        [0.7, 0.7, 0.7],
        [0.7, 0.7, 0.7]
    );
    scene.Add(dirLight);

    var tree = new Model(
        './models/tree.json',
        './models/tree.png',
        './models/tree_specular.png',
        function () {
            scene.Add(tree);
            tree.setPosition([0,-3,-10]);
            tree.shine = 10;
        }
    );

    var t0 = performance.now();
    var loop = function () {
        scene.Render(camera);
        t0 = performance.now();
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
};
