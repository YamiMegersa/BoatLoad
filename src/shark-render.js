import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FishAnimator } from './environment/FishAnimator.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const canvas = document.querySelector('#canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2, 5, 5);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

scene.add(new THREE.GridHelper(20, 20));

const fishUrls = [
  '/src/assets/fish/Dolphin.glb',
  '/src/assets/fish/Fish-BEcU9rjiAq.glb',
  '/src/assets/fish/Fish-XWl86YFtpF.glb',
  '/src/assets/fish/Fish.glb',
  '/src/assets/fish/Manta ray.glb',
  '/src/assets/fish/Shark.glb',
  '/src/assets/fish/Whale.glb'
];

let animators = [];

Promise.all(
  fishUrls.map(url => new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
  }))
).then(gltfs => {
  const ui = document.getElementById('ui');
  let debugInfo = `Loaded ${gltfs.length} models successfully natively as SkinnedMesh.<br/><br/>`;
  
  gltfs.forEach((gltf, index) => {
    const mesh = gltf.scene;
    
    // Normalize scale
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const normScale = (maxDim > 0) ? (4.0 / maxDim) : 1;
    mesh.scale.setScalar(normScale);
    
    // Spread them out in a line
    mesh.position.set((index - (gltfs.length / 2)) * 6, 0, 0);

    let hasBone = false;
    mesh.traverse(c => {
      if (c.isBone) hasBone = true;
    });

    if (hasBone) {
      debugInfo += `Model ${index} articulated.<br/>`;
    } else {
      debugInfo += `Model ${index} missing bones.<br/>`;
    }
    
    animators.push(new FishAnimator(mesh, 1.0));
    scene.add(mesh);
  });
  
  ui.innerHTML = debugInfo;
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  animators.forEach(a => a.update(clock.getDelta()));
  controls.update();
  renderer.render(scene, camera);
}
animate();
