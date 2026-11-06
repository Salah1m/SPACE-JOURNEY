import * as THREE from 'three';

const game = document.querySelector('#game');
const distanceEl = document.querySelector('#distance');
const coinsEl = document.querySelector('#coins');
const startPanel = document.querySelector('#message');
const gameOverPanel = document.querySelector('#gameover');
const loading = document.querySelector('#loading');
const countdownEl = document.querySelector('#countdown');
const toast = document.querySelector('#toast');

let scene, camera, renderer, bike, rider, road, roadLines = [], obstacles = [], pickups = [], stars, earthGroupRef;
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
  const dark = new THREE.MeshStandardMaterial({color:0x111b31,metalness:.35,roughness:.35,emissive:0x142b45}), cyan = new THREE.MeshBasicMaterial({color:0x29dff5}), white = new THREE.MeshBasicMaterial({color:0xeaf6ff}), orange = new THREE.MeshBasicMaterial({color:0xffa52d});
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
  root.position.set(0,0,1);
  scene.add(root);
  return root;
}
function makeWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071329);
  scene.fog = new THREE.FogExp2(0x09162b,.012);
  camera = new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.1,500);
  camera.position.set(0,13,18);
  // Aim the camera at the track immediately; otherwise it starts level and the 3D world is below the view.
  camera.lookAt(0,0.8,-5);
  renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  game.insertBefore(renderer.domElement,game.firstChild);
  scene.add(new THREE.HemisphereLight(0x9bcfff,0x35233b,2.1));
  const sun = new THREE.DirectionalLight(0xffd6a1,2.5);
  sun.position.set(-8,15,8); sun.castShadow=true; scene.add(sun);
  // A more grounded solar-system view: Earth, its Moon, and distant Mars.
  const earthGroup = new THREE.Group();
  earthGroup.position.set(-18,12,-105);
  const earthRadius = 10.5;
  // Procedural Earth map: blue oceans, recognizable green continents and soft cloud bands.
  const earthCanvas=document.createElement('canvas');
  earthCanvas.width=1024; earthCanvas.height=512;
  const ctx=earthCanvas.getContext('2d');
  const oceanGrad=ctx.createLinearGradient(0,0,0,512);
  oceanGrad.addColorStop(0,'#174f86'); oceanGrad.addColorStop(.48,'#1676b5'); oceanGrad.addColorStop(1,'#0b376b');
  ctx.fillStyle=oceanGrad; ctx.fillRect(0,0,1024,512);
  ctx.fillStyle='#568d50'; ctx.strokeStyle='#83ad69'; ctx.lineWidth=7;
  const continents=[
    [[90,115],[135,75],[205,65],[245,95],[230,145],[190,165],[180,220],[145,250],[115,205],[80,180]],
    [[205,255],[250,275],[270,335],[250,405],[220,455],[195,390],[180,320]],
    [[440,90],[500,70],[555,90],[590,125],[570,165],[530,175],[510,220],[475,205],[455,160]],
    [[505,225],[555,210],[590,255],[580,320],[550,390],[520,360],[495,300]],
    [[630,100],[690,65],[770,75],[825,110],[865,160],[830,205],[780,195],[745,235],[700,205],[665,160]],
    [[760,260],[805,245],[840,285],[825,335],[790,350],[765,315]],
    [[900,390],[935,380],[960,410],[940,445],[905,435]]
  ];
  for(const points of continents){
    ctx.beginPath(); ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Subtle polar ice and cloud wisps.
  ctx.fillStyle='rgba(220,245,255,.78)';
  ctx.fillRect(0,0,1024,20); ctx.fillRect(0,492,1024,20);
  for(let i=0;i<34;i++){
    const x=(i*173)%1024, y=55+((i*79)%400);
    ctx.beginPath(); ctx.ellipse(x,y,24+(i%5)*11,3+(i%3)*2,-.18,0,Math.PI*2);
    ctx.fillStyle='rgba(235,248,255,.10)'; ctx.fill();
  }
  const earthTexture=new THREE.CanvasTexture(earthCanvas);
  earthTexture.colorSpace=THREE.SRGBColorSpace;
  const earthOcean=new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius,64,48),
    new THREE.MeshBasicMaterial({map:earthTexture, fog:false})
  );
  earthGroup.add(earthOcean);
  const cloudCanvas=document.createElement('canvas');
  cloudCanvas.width=1024; cloudCanvas.height=512;
  const cloudCtx=cloudCanvas.getContext('2d');
  for(let i=0;i<150;i++){
    const x=(i*137)%1024, y=(i*71)%512;
    cloudCtx.fillStyle='rgba(255,255,255,'+(0.10+(i%5)*.035)+')';
    cloudCtx.beginPath();
    cloudCtx.ellipse(x,y,18+(i%7)*8,4+(i%4)*2,(i%9)*.12,0,Math.PI*2);
    cloudCtx.fill();
  }
  const cloudTexture=new THREE.CanvasTexture(cloudCanvas);
  cloudTexture.colorSpace=THREE.SRGBColorSpace;
  const cloudShell = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius*1.018,48,36),
    new THREE.MeshBasicMaterial({map:cloudTexture,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false,fog:false})
  );
  earthGroup.add(cloudShell);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius*1.07,40,30),
    new THREE.MeshBasicMaterial({color:0x35aaff,transparent:true,opacity:.24,side:THREE.BackSide,depthWrite:false,fog:false})
  );
  earthGroup.add(atmosphere);
  scene.add(earthGroup);
  earthGroupRef = earthGroup;
  const earthLight = new THREE.DirectionalLight(0xffe4b5,1.4);
  earthLight.position.set(-35,30,-55); scene.add(earthLight);

  const moon = new THREE.Mesh(new THREE.SphereGeometry(2.15,28,20),new THREE.MeshStandardMaterial({color:0x9b9da3,roughness:1}));
  moon.position.set(-1,19,-91); scene.add(moon);
  const moonCraterMat = new THREE.MeshBasicMaterial({color:0x777d87});
  for (const [x,y,z,r] of [[-.6,.4,1.9,.28],[.75,-.3,1.95,.2],[-.1,-.8,1.95,.16]]) {
    const crater = new THREE.Mesh(new THREE.CircleGeometry(r,16),moonCraterMat);
    crater.position.set(x,y,z); moon.add(crater);
  }

  const mars = new THREE.Mesh(new THREE.SphereGeometry(5.8,36,28),new THREE.MeshStandardMaterial({color:0x9d513b,roughness:1}));
  mars.position.set(23,10,-118); scene.add(mars);
  const marsLight = new THREE.PointLight(0xff7548,18,35); marsLight.position.copy(mars.position); scene.add(marsLight);
  const starGeo = new THREE.BufferGeometry(), positions=[];
  for(let i=0;i<900;i++) positions.push((Math.random()-.5)*180,Math.random()*75-4,-Math.random()*230);
  starGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  stars = new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xc9eaff,size:.28,sizeAttenuation:true}));
  scene.add(stars);
  road = new THREE.Group(); scene.add(road);
  const roadMat=new THREE.MeshBasicMaterial({color:0x263b5b}), edgeMat=new THREE.MeshBasicMaterial({color:0x29dff5}), lineMat=new THREE.MeshBasicMaterial({color:0xd8f5ff});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,320),new THREE.MeshBasicMaterial({color:0x08152b}));
  ground.rotation.x=-Math.PI/2; ground.position.set(0,-.64,-112); road.add(ground);
  // One continuous curved road mesh: no separated rectangular road tiles.
  const roadCenterAt=(z)=>{const t=(12-z)/8;return Math.sin(t*.16)*3.7+Math.sin(t*.065)*1.8;};
  const roadPositions=[], roadIndices=[], leftEdge=[], rightEdge=[];
  const roadSteps=180, roadStart=20, roadEnd=-260, halfWidth=4.5;
  for(let i=0;i<=roadSteps;i++){
    const z=roadStart+(roadEnd-roadStart)*i/roadSteps;
    const cx=roadCenterAt(z);
    roadPositions.push(cx-halfWidth,-.43,z,cx+halfWidth,-.43,z);
    leftEdge.push(new THREE.Vector3(cx-halfWidth,-.20,z));
    rightEdge.push(new THREE.Vector3(cx+halfWidth,-.20,z));
    if(i<roadSteps){const a=i*2;roadIndices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const roadGeometry=new THREE.BufferGeometry();
  roadGeometry.setAttribute('position',new THREE.Float32BufferAttribute(roadPositions,3));
  roadGeometry.setIndex(roadIndices);roadGeometry.computeVertexNormals();
  road.add(new THREE.Mesh(roadGeometry,roadMat));
  const edgeMaterial=new THREE.LineBasicMaterial({color:0x29dff5});
  road.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftEdge),edgeMaterial));
  road.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightEdge),edgeMaterial));
  // Dashed centre markings follow the exact same curve.
  for(let z=14;z>-250;z-=16){
    const cx=roadCenterAt(z);
    box(road,[.09,.025,3.2],lineMat,[cx,-.205,z]);
  }
  // Roadside lights are attached to the curve, not placed in straight rows.
  for(let z=12;z>-250;z-=8){
    const cx=roadCenterAt(z);
    for(const side of [-1,1]){
      const pillar=new THREE.Group();pillar.position.set(cx+side*7,-.1,z);road.add(pillar);
      cylinder(pillar,.1,.16,2.8,edgeMat,[0,1.2,0]);
      const lamp=new THREE.PointLight(0x36dfff,1.5,4);lamp.position.set(0,2.5,0);pillar.add(lamp);
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
  bike.position.set(0,0,1);
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
  camera.position.y=THREE.MathUtils.damp(camera.position.y,13+bike.position.y*.2,2.5,dt);
  camera.lookAt(bike.position.x*.25,0.8,-5);
  road.position.z=(road.position.z+currentSpeed*dt)%8;
  stars.position.z=(stars.position.z+currentSpeed*dt*.15)%30;
  spawnTimer-=dt; pickupTimer-=dt;
  if(spawnTimer<=0){addObstacle();spawnTimer=Math.max(.62,1.45-distance/2500)+(Math.random()*.45)}
  if(pickupTimer<=0){addPickup();pickupTimer=1.1+Math.random()*1.0}
  for(let i=obstacles.length-1;i>=0;i--){
    const o=obstacles[i]; o.position.z+=currentSpeed*dt; o.rotation.y+=dt*.8;
    if(o.position.z>4){
      if(Math.abs(o.position.x-bike.position.x)<1.15 && bike.position.y<.7){speed=Math.max(14,speed*.72);showToast('OBSTACLE HIT · KEEP RIDING');}
      scene.remove(o);obstacles.splice(i,1);
    } else if(Math.abs(o.position.z-bike.position.z)<1.3 && Math.abs(o.position.x-bike.position.x)<1.05 && bike.position.y<.65){speed=Math.max(14,speed*.72);showToast('OBSTACLE HIT · KEEP RIDING');o.position.z=5;}
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
  if (earthGroupRef) earthGroupRef.rotation.y += dt*.018;
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