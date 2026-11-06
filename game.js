import * as THREE from 'three';

const game = document.querySelector('#game');
const distanceEl = document.querySelector('#distance');
const coinsEl = document.querySelector('#coins');
const startPanel = document.querySelector('#message');
const gameOverPanel = document.querySelector('#gameover');
const loading = document.querySelector('#loading');
const countdownEl = document.querySelector('#countdown');
const toast = document.querySelector('#toast');

let scene, camera, renderer, bike, rider, road, roadLines = [], obstacles = [], pickups = [], stars;
let running = false, paused = false, started = false;
let distance = 0, coinCount = 0, speed = 23, targetX = 0, steer = 0, jumpTime = 0, turboTime = 0;
let lastTime = 0, spawnTimer = 0, pickupTimer = 0, toastTimer = 0;
const clock = new THREE.Clock();

function mat(color, roughness=.55, metalness=.15, emissive=0x000000) {
  return new THREE.MeshStandardMaterial({color, roughness, metalness, emissive, emissiveIntensity:.55});
}
function box(parent, size, material, pos, rot) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  parent.add(mesh); return mesh;
}
function cylinder(parent, r1, r2, h, material, pos, rot=[0,0,0], segments=16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments), material);
  mesh.position.set(...pos); mesh.rotation.set(...rot); parent.add(mesh); return mesh;
}
function makeBike() {
  const root = new THREE.Group();
  const dark = mat(0x111b31,.3,.8), cyan = mat(0x29dff5,.25,.65,0x087d9c), white = mat(0xdcecff,.35,.4), orange = mat(0xffa52d,.3,.5,0x9b3d00);
  // Hover-bike body and twin glowing engines
  box(root,[.72,.32,1.65],dark,[0,.12,0],[.08,0,0]);
  box(root,[.56,.22,.72],cyan,[0,.31,-.18],[.12,0,0]);
  box(root,[.34,.18,.54],white,[0,.45,.36],[-.25,0,0]);
  for (const x of [-.42,.42]) {
    cylinder(root,.22,.22,.24,dark,[x,-.02,.45],[Math.PI/2,0,0],20);
    cylinder(root,.15,.15,.25,cyan,[x,-.02,.58],[Math.PI/2,0,0],20);
    cylinder(root,.17,.17,.32,orange,[x,-.08,-.77],[Math.PI/2,0,0],20);
  }
  // Front fork, handle and windshield
  box(root,[.08,.65,.09],white,[0,.34,.67],[-.2,0,0]);
  box(root,[.9,.07,.12],dark,[0,.62,.68]);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(.32,16,12,0,Math.PI*2,0,Math.PI/2),mat(0x54dfff,.18,.55,0x124e77));
  glass.scale.set(1,.55,1); glass.position.set(0,.76,.22); root.add(glass);
  // Astronaut body
  rider = new THREE.Group();
  box(rider,[.48,.62,.32],white,[0,1.02,-.12],[.25,0,0]);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.27,20,16),white);
  helmet.position.set(0,1.48,-.03); rider.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.225,20,14),mat(0x102c50,.12,.7,0x082b48));
  visor.scale.set(1,.8,.55); visor.position.set(0,1.49,.16); rider.add(visor);
  for (const x of [-.32,.32]) {
    box(rider,[.16,.5,.17],white,[x,.96,.1],[0,0,x<0?-.25:.25]);
    box(rider,[.18,.48,.2],dark,[x*.72,.45,-.1],[.1,0,0]);
  }
  root.add(rider);
  root.position.set(0,0,2);
  scene.add(root);
  return root;
}
function makeWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071329);
  scene.fog = new THREE.FogExp2(0x09162b,.012);
  camera = new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.1,500);
  camera.position.set(0,5.4,10.5);
  renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  game.insertBefore(renderer.domElement,game.firstChild);
  scene.add(new THREE.HemisphereLight(0x9bcfff,0x35233b,2.1));
  const sun = new THREE.DirectionalLight(0xffd6a1,2.5);
  sun.position.set(-8,15,8); sun.castShadow=true; scene.add(sun);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(8,32,24),mat(0x9c4936,.9,.05));
  planet.position.set(-18,12,-85); scene.add(planet);
  const planetGlow = new THREE.PointLight(0xff7548,90,70); planetGlow.position.copy(planet.position); scene.add(planetGlow);
  const starGeo = new THREE.BufferGeometry(), positions=[];
  for(let i=0;i<900;i++) positions.push((Math.random()-.5)*180,Math.random()*75-4,-Math.random()*230);
  starGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  stars = new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xc9eaff,size:.28,sizeAttenuation:true}));
  scene.add(stars);
  road = new THREE.Group(); scene.add(road);
  const roadMat=mat(0x202b40,.88,.18), edgeMat=mat(0x29dff5,.35,.6,0x087d9c), lineMat=mat(0x7c9db8,.5,.3);
  for(let i=0;i<34;i++){
    const z=12-i*8;
    const slab=box(road,[9,.35,8.1],roadMat,[0,-.42,z]);
    slab.receiveShadow=true;
    for(const x of [-4.55,4.55]) box(road,[.1,.14,8],edgeMat,[x,-.19,z]);
    if(i%2===0) box(road,[.09,.025,3],lineMat,[0,-.23,z]);
    for(const x of [-7,7]) {
      const pillar=new THREE.Group(); pillar.position.set(x,-.1,z); road.add(pillar);
      cylinder(pillar,.1,.16,2.8,edgeMat,[0,1.2,0]);
      const lamp=new THREE.PointLight(0x36dfff,2,5); lamp.position.set(0,2.5,0); pillar.add(lamp);
    }
  }
  bike=makeBike();
}
function addObstacle() {
  const group=new THREE.Group();
  const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.8,1),mat(0x9a5848,.95,.05));
  rock.scale.set(.85,.75,1); rock.castShadow=true; group.add(rock);
  const glow=new THREE.PointLight(0xff673d,1.5,3); glow.position.y=.4; group.add(glow);
  group.position.set((Math.random()-.5)*6.2,-.05,-78);
  group.userData.kind='rock'; scene.add(group); obstacles.push(group);
}
function addPickup() {
  const group=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.38,.095,10,24),mat(0xffd36a,.2,.7,0xff9b16));
  ring.rotation.x=Math.PI/2; group.add(ring);
  const core=new THREE.Mesh(new THREE.OctahedronGeometry(.2),mat(0xfff0a0,.15,.5,0xffbd31)); group.add(core);
  group.position.set((Math.random()-.5)*5.8,.85,-78);
  group.userData.kind='coin'; scene.add(group); pickups.push(group);
}
function showToast(text) { toast.textContent=text; toast.style.opacity='1'; toastTimer=.9; }
function resetGame() {
  distance=0; coinCount=0; speed=23; targetX=0; steer=0; jumpTime=0; turboTime=0; spawnTimer=.5; pickupTimer=1;
  for(const item of [...obstacles,...pickups]) scene.remove(item);
  obstacles=[]; pickups=[];
  bike.position.set(0,0,2);
  distanceEl.textContent='0000 m'; coinsEl.textContent='0';
}
function begin() {
  resetGame(); startPanel.classList.add('hidden'); gameOverPanel.classList.add('hidden');
  countdownEl.textContent='3'; let n=3;
  const tick=()=>{ n--; if(n>0){countdownEl.textContent=String(n);setTimeout(tick,650)} else {countdownEl.textContent='GO!';setTimeout(()=>countdownEl.textContent='',450);running=true;paused=false;lastTime=performance.now()} };
  setTimeout(tick,650);
}
function endGame() {
  running=false; gameOverPanel.classList.remove('hidden');
  document.querySelector('#final-score').textContent=`You travelled ${Math.floor(distance)} metres · ${coinCount} energy coins`;
}
function update(dt) {
  if(!running||paused) return;
  const turbo= turboTime>0;
  if(turboTime>0) turboTime-=dt;
  if(jumpTime>0) jumpTime-=dt;
  const currentSpeed=speed*(turbo?1.8:1);
  distance+=currentSpeed*dt*.55;
  distanceEl.textContent=String(Math.floor(distance)).padStart(4,'0')+' m';
  bike.position.x=THREE.MathUtils.damp(bike.position.x,targetX,5.5,dt);
  bike.position.y=jumpTime>0?Math.sin((1-jumpTime/.72)*Math.PI)*1.55:0;
  bike.rotation.z=THREE.MathUtils.damp(bike.rotation.z,-(targetX-bike.position.x)*.12,5,dt);
  bike.rotation.x=THREE.MathUtils.damp(bike.rotation.x,turbo?-.08:0,3,dt);
  camera.position.x=THREE.MathUtils.damp(camera.position.x,bike.position.x*.35,2.5,dt);
  camera.position.y=THREE.MathUtils.damp(camera.position.y,5.4+bike.position.y*.25,2.5,dt);
  camera.lookAt(bike.position.x*.35,1,-8);
  road.position.z=(road.position.z+currentSpeed*dt)%8;
  stars.position.z=(stars.position.z+currentSpeed*dt*.15)%30;
  spawnTimer-=dt; pickupTimer-=dt;
  if(spawnTimer<=0){addObstacle();spawnTimer=Math.max(.62,1.45-distance/2500)+(Math.random()*.45)}
  if(pickupTimer<=0){addPickup();pickupTimer=1.1+Math.random()*1.0}
  for(let i=obstacles.length-1;i>=0;i--){
    const o=obstacles[i]; o.position.z+=currentSpeed*dt; o.rotation.y+=dt*.8;
    if(o.position.z>4){
      if(Math.abs(o.position.x-bike.position.x)<1.15 && bike.position.y<.7){endGame();return}
      scene.remove(o);obstacles.splice(i,1);
    } else if(Math.abs(o.position.z-bike.position.z)<1.3 && Math.abs(o.position.x-bike.position.x)<1.05 && bike.position.y<.65){endGame();return}
  }
  for(let i=pickups.length-1;i>=0;i--){
    const p=pickups[i]; p.position.z+=currentSpeed*dt; p.rotation.y+=dt*2.2;
    if(p.position.z>4){scene.remove(p);pickups.splice(i,1);continue}
    if(Math.abs(p.position.z-bike.position.z)<1.35&&Math.abs(p.position.x-bike.position.x)<1.1&&Math.abs(p.position.y-bike.position.y-0.8)<1.2){
      coinCount++;coinsEl.textContent=coinCount;scene.remove(p);pickups.splice(i,1);showToast('+ ENERGY');
    }
  }
  if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)toast.style.opacity='0'}
}
function animate(now) {
  requestAnimationFrame(animate);
  const dt=Math.min((now-lastTime)/1000||0,.04); lastTime=now;
  update(dt);
  if(renderer) renderer.render(scene,camera);
}
function setSteer(clientX) {
  const rect=game.getBoundingClientRect();
  const normalized=(clientX-rect.left)/rect.width;
  targetX=THREE.MathUtils.clamp((normalized-.5)*10,-3.3,3.3);
}
let pointerDown=false;
game.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;pointerDown=true;setSteer(e.clientX)});
game.addEventListener('pointermove',e=>{if(pointerDown)setSteer(e.clientX)});
window.addEventListener('pointerup',()=>pointerDown=false);
document.querySelector('#jump').addEventListener('pointerdown',e=>{e.preventDefault();if(running&&jumpTime<=0)jumpTime=.72});
document.querySelector('#turbo').addEventListener('pointerdown',e=>{e.preventDefault();if(running){turboTime=1.7;showToast('TURBO BOOST!')}});
document.querySelector('#start').addEventListener('click',begin);
document.querySelector('#again').addEventListener('click',begin);
document.querySelector('#pause').addEventListener('click',()=>{
  if(!started)return;
  paused=!paused; document.querySelector('#pause').textContent=paused?'▶':'Ⅱ';
  if(paused)showToast('PAUSED'); else lastTime=performance.now();
});
window.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft'||e.key==='a')targetX=Math.max(-3.3,targetX-.65);
  if(e.key==='ArrowRight'||e.key==='d')targetX=Math.min(3.3,targetX+.65);
  if(e.key===' '&&running&&jumpTime<=0)jumpTime=.72;
  if(e.key==='Shift'&&running)turboTime=1.7;
});
window.addEventListener('resize',()=>{
  if(!camera||!renderer)return;
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
});
try {
  makeWorld(); loading.remove(); started=true; requestAnimationFrame(animate);
} catch(err) {
  loading.textContent='3D ENGINE COULD NOT START · PLEASE RELOAD';
  console.error(err);
}