import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DockStall } from './environment/DockStall.js';
import { Ocean } from './environment/Ocean.js';
import { Sky } from './environment/Sky.js';
import { WeatherSystem } from './environment/WeatherSystem.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#8cb1d1');

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 2, 0);

// Global lighting
const ambient = new THREE.AmbientLight(0xffffff, 1.0);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.castShadow = true;
scene.add(ambient, sun);

// Environment
const ocean = new Ocean();
ocean.init(scene);
ocean.breakwaterEnabled = true;

const sky = new Sky();
sky.init(scene);

const weather = new WeatherSystem();
const stall = new DockStall();
const stallGroup = stall.build();
scene.add(stallGroup);

// UI overlay for days
const ui = document.createElement('div');
ui.style.cssText = 'position:absolute; top:10px; left:50%; transform:translateX(-50%); display:flex; gap:10px; z-index:100;';
for (let i = 1; i <= 7; i++) {
  const btn = document.createElement('button');
  btn.innerText = `Day ${i}`;
  btn.style.cssText = 'padding:10px; cursor:pointer; background:rgba(0,0,0,0.7); color:white; border:none; border-radius:5px; font-family:sans-serif;';
  btn.onclick = () => loadDay(i);
  ui.appendChild(btn);
}
document.body.appendChild(ui);

const camBtn = document.createElement('button');
camBtn.innerText = 'Toggle Shopkeeper View';
camBtn.style.cssText = 'position:absolute; bottom:20px; left:50%; transform:translateX(-50%); padding:10px; cursor:pointer; background:rgba(0,0,0,0.7); color:white; border:none; border-radius:5px; font-family:sans-serif; z-index:100;';
let isShopCam = false;
camBtn.onclick = () => {
    isShopCam = !isShopCam;
    if (!isShopCam) {
        camera.position.set(0, 5, 20);
        camera.lookAt(0, 0, 0);
    }
};
document.body.appendChild(camBtn);

async function loadDay(day) {
    await weather.loadLevel(day, {
        ambient, sun, ocean, sky, lanternLight: stall.lanternLight
    });
}
loadDay(1); // Default

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const time = clock.getElapsedTime();
  
  controls.update();
  ocean.update(delta);
  stall.update(delta, time);
  
  if (isShopCam && stall.shopCam) {
      renderer.render(scene, stall.shopCam);
  } else {
      renderer.render(scene, camera);
  }
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (stall.shopCam) {
      stall.shopCam.aspect = window.innerWidth / window.innerHeight;
      stall.shopCam.updateProjectionMatrix();
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
});
