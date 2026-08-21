import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SharkSkinRepair } from './environment/SharkSkinRepair.js';
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

let animator = null;

new GLTFLoader().load('/src/assets/fish/shark.glb', (gltf) => {
  const mesh = gltf.scene;
  const ui = document.getElementById('ui');
  
  // Debug attributes BEFORE repair
  let debugInfo = "Loaded.<br/>";
  mesh.traverse(c => {
    if (c.isMesh) {
      debugInfo += `Original Mesh: ${c.name}<br/>`;
      debugInfo += `  isSkinnedMesh: ${c.isSkinnedMesh}<br/>`;
      debugInfo += `  skinIndex: ${!!c.geometry.attributes.skinIndex}<br/>`;
      debugInfo += `  skinWeight: ${!!c.geometry.attributes.skinWeight}<br/>`;
    }
  });

  const repair = SharkSkinRepair.repair(mesh);
  if (repair) {
    debugInfo += `Repair successful.<br/>`;
    
    // Debug attributes AFTER repair
    repair.skinnedMesh.traverse(c => {
      if (c.isMesh) {
        debugInfo += `Repaired Mesh: ${c.name}<br/>`;
        debugInfo += `  isSkinnedMesh: ${c.isSkinnedMesh}<br/>`;
        debugInfo += `  skinIndex: ${!!c.geometry.attributes.skinIndex}<br/>`;
        debugInfo += `  skinWeight: ${!!c.geometry.attributes.skinWeight}<br/>`;
      }
    });
    
    const tailBone = repair.tailBone;
    animator = new FishAnimator(mesh, tailBone, 1.0);
    scene.add(mesh);
  } else {
    debugInfo += `Repair failed.<br/>`;
    scene.add(mesh);
  }
  ui.innerHTML = debugInfo;
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  if (animator) animator.update(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
}
animate();
