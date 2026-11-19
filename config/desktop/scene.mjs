import { AudioController } from './audio-controller.mjs';
import { createClips, COORDINATES_URL, formatTime, groupName } from './model.mjs';

const $ = id => document.getElementById(id);
const scene = $('sound-scene'), camera = $('camera'), pointContainer = $('sound-points');
const enterButton = $('enter-scene'), heard = new Set(), points = new Map(), rows = new Map();
const audio = new Audio();
audio.id = 'clip-audio'; audio.hidden = true; document.body.appendChild(audio);
let clips = [], currentSnapshot = { clip: null, status: 'stopped', currentTime: 0, duration: 5 };
let started = false, canvas, hovered = null, pointer = null, yaw = 0, pitch = 0, activeGroup = 'all';
const DEFAULT_FOV = 96;
let fieldOfView = DEFAULT_FOV;
let noticeTimer, context, panner, listenerForward, listenerUp, cameraQuaternion, raycaster, pointerNDC;

const controller = new AudioController({
  audio,
  beforePlay: async clip => { await prepareSpatialAudio(); if (panner && controller.clip?.id === clip.id) setSpatialPosition(panner, clip.position); },
  onChange: renderPlayback,
  onHeard: clip => {
    heard.add(clip.id);
    const total = Object.assign(document.createElement('span'), { textContent: `/ ${clips.length}` });
    $('heard-count').replaceChildren(document.createTextNode(`${heard.size} `), total);
    $('heard-progress').style.width = `${100 * heard.size / clips.length}%`;
    $('group-summary').textContent = heard.size === clips.length ? 'You have explored every sound point' : `${new Set(clips.map(item => item.cluster)).size} sound groups. Keep exploring.`;
    updatePoints();
  },
  onError: error => {
    console.error('Audio playback failed:', error);
    notify(error.name === 'NotAllowedError' ? 'Your browser has not allowed audio yet. Please press Play again.' : 'This clip could not play. Try again or choose another sound point.');
  }
});

function notify(message) {
  clearTimeout(noticeTimer); $('notice').textContent = message; $('notice').hidden = false;
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 6500);
}

function renderPlayback(snapshot) {
  currentSnapshot = snapshot;
  const { clip, status, currentTime, duration } = snapshot;
  $('player').dataset.state = status; $('player').dataset.clipId = clip?.id ?? '';
  const active = ['playing', 'loading'].includes(status);
  const labels = { stopped: clip ? 'STOPPED' : 'READY TO EXPLORE', loading: 'LOADING AUDIO', playing: 'NOW LISTENING', paused: 'PAUSED', ended: 'CLIP FINISHED', error: 'PLAYBACK FAILED' };
  $('playback-status').textContent = labels[status]; $('playback-dot').className = `state-dot ${status}`;
  $('clip-title').textContent = clip ? `Clip ${String(clip.number).padStart(3, '0')}` : 'Choose a sound point to begin';
  $('clip-meta').textContent = clip ? `${groupName(clip.cluster)} · Source ${formatTime(clip.start)}–${formatTime(clip.start + clip.duration)} · 5 s` : 'Every sound has a place. Find your own path.';
  $('play-label').textContent = active ? 'Pause' : 'Play'; $('play-icon').textContent = active ? 'Ⅱ' : '▶';
  $('play-pause').setAttribute('aria-label', active ? 'Pause playback' : 'Play selected clip');
  for (const id of ['play-pause', 'stop', 'replay']) $(id).disabled = !clip;
  $('elapsed').textContent = formatTime(currentTime); $('duration').textContent = formatTime(duration);
  $('seek').disabled = !clip || ['loading', 'error'].includes(status);
  $('seek').max = duration; $('seek').value = Math.min(duration, currentTime);
  $('seek').setAttribute('aria-valuetext', `${formatTime(currentTime)} of ${formatTime(duration)}`);
  updatePoints();
}

function updatePoints() {
  for (const clip of clips) {
    const entity = points.get(clip.id), row = rows.get(clip.id);
    if (!entity || !row) continue;
    const selected = currentSnapshot.clip?.id === clip.id;
    const playing = selected && currentSnapshot.status === 'playing';
    const color = playing ? '#fa765e' : heard.has(clip.id) ? '#78c6a1' : '#fff7e8';
    if (entity.dataset.color !== color) { entity.setAttribute('material', 'color', color); entity.dataset.color = color; }
    const scale = playing ? 1.6 : selected || hovered?.id === clip.id ? 1.3 : 1;
    if (entity.dataset.pointScale !== String(scale)) { entity.object3D.scale.setScalar(scale); entity.dataset.pointScale = String(scale); }
    row.classList.toggle('is-heard', heard.has(clip.id)); row.classList.toggle('is-playing', playing);
    row.setAttribute('aria-current', String(selected));
  }
}

function setSpatialPosition(node, position) {
  if (node.positionX) { node.positionX.value = position[0]; node.positionY.value = position[1]; node.positionZ.value = position[2]; }
  else node.setPosition(...position);
}

async function prepareSpatialAudio() {
  if (!context) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    context = new Context();
    const source = context.createMediaElementSource(audio);
    panner = context.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
    panner.refDistance = 150; panner.rolloffFactor = 0; // Fixed viewpoint: no artificial volume penalty for mapped height.
    panner.coneInnerAngle = 360; panner.coneOuterAngle = 360;
    source.connect(panner).connect(context.destination); syncListener();
  }
  if (context.state === 'suspended') await context.resume();
}

function syncListener() {
  if (!context || !listenerForward) return;
  camera.object3D.getWorldQuaternion(cameraQuaternion);
  listenerForward.set(0, 0, -1).applyQuaternion(cameraQuaternion); listenerUp.set(0, 1, 0).applyQuaternion(cameraQuaternion);
  const listener = context.listener;
  if (listener.forwardX) {
    listener.forwardX.value = listenerForward.x; listener.forwardY.value = listenerForward.y; listener.forwardZ.value = listenerForward.z;
    listener.upX.value = listenerUp.x; listener.upY.value = listenerUp.y; listener.upZ.value = listenerUp.z;
  } else listener.setOrientation(listenerForward.x, listenerForward.y, listenerForward.z, listenerUp.x, listenerUp.y, listenerUp.z);
}

function orientCamera() {
  pitch = Math.max(-Math.PI * 0.47, Math.min(Math.PI * 0.47, pitch));
  yaw = ((yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  camera.object3D.rotation.set(pitch, yaw, 0, 'YXZ'); camera.object3D.updateMatrixWorld(true); syncListener();
}

function zoomView(change) {
  fieldOfView = Math.max(50, Math.min(110, fieldOfView + change));
  camera.setAttribute('camera', 'fov', fieldOfView);
  $('zoom-out').disabled = fieldOfView >= 110;
  $('zoom-in').disabled = fieldOfView <= 50;
  clearHover();
}

function faceClip(clip) {
  const [x, y, z] = clip.position;
  yaw = Math.atan2(-x, -z); pitch = Math.atan2(y, Math.hypot(x, z)); orientCamera();
}

function playClip(clip, face = false) {
  if (!started) return;
  if (face) faceClip(clip);
  controller.play(clip, { restart: currentSnapshot.clip?.id !== clip.id });
}

function pick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointerNDC.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  scene.object3D.updateMatrixWorld(true); raycaster.setFromCamera(pointerNDC, scene.camera);
  for (const hit of raycaster.intersectObjects(pointContainer.object3D.children, true)) {
    let object = hit.object;
    while (object && !object.el?.dataset.clipId) object = object.parent;
    if (object?.visible && object.el?.object3D.visible) return clips.find(clip => clip.id === object.el.dataset.clipId) ?? null;
  }
  return null;
}

function clearHover() {
  hovered = null; $('point-tooltip').hidden = true; canvas?.classList.remove('on-point'); updatePoints();
}

function setupNavigation() {
  canvas = scene.canvas; canvas.tabIndex = 0; canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', '3D sound scene. Drag to look around, click a point to listen, use arrow keys to turn, Enter to play a centered point, Space to pause, and Esc to stop.');
  canvas.addEventListener('pointerdown', event => {
    if (!started || event.button !== 0) return;
    canvas.focus({ preventScroll: true }); document.body.classList.remove('keyboard-navigation');
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, dragged: false };
    canvas.setPointerCapture(event.pointerId); clearHover();
  });
  canvas.addEventListener('pointermove', event => {
    if (!started) return;
    if (pointer && pointer.id === event.pointerId) {
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (Math.hypot(dx, dy) > 6) pointer.dragged = true;
      if (pointer.dragged) { canvas.classList.add('dragging'); yaw = pointer.yaw - dx * 0.003; pitch = pointer.pitch - dy * 0.003; orientCamera(); }
      return;
    }
    const clip = pick(event.clientX, event.clientY);
    if (hovered?.id !== clip?.id) { hovered = clip; updatePoints(); }
    canvas.classList.toggle('on-point', Boolean(clip));
    const tooltip = $('point-tooltip'); tooltip.hidden = !clip;
    if (clip) {
      tooltip.textContent = `Clip ${String(clip.number).padStart(3, '0')} · ${groupName(clip.cluster)} · Click to listen`;
      tooltip.style.left = `${Math.min(event.clientX + 16, window.innerWidth - 260)}px`;
      tooltip.style.top = `${Math.max(90, event.clientY - 42)}px`;
    }
  });
  canvas.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dragged = pointer.dragged || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 6;
    pointer = null; canvas.classList.remove('dragging');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!dragged) { const clip = pick(event.clientX, event.clientY); if (clip) playClip(clip); }
  });
  canvas.addEventListener('pointercancel', () => { pointer = null; canvas.classList.remove('dragging'); clearHover(); });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; canvas.classList.remove('dragging'); });
  canvas.addEventListener('pointerleave', () => { if (!pointer) clearHover(); });
  canvas.addEventListener('wheel', event => {
    if (!started || event.ctrlKey) return;
    event.preventDefault(); zoomView(Math.sign(event.deltaY) * 4);
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    if (!started) return;
    const amount = 3 * Math.PI / 180;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); document.body.classList.add('keyboard-navigation');
      if (event.key === 'ArrowLeft') yaw += amount;
      if (event.key === 'ArrowRight') yaw -= amount;
      if (event.key === 'ArrowUp') pitch += amount;
      if (event.key === 'ArrowDown') pitch -= amount;
      orientCamera(); clearHover();
    } else if (event.key === 'Enter') {
      event.preventDefault(); const rect = canvas.getBoundingClientRect();
      const clip = pick(rect.left + rect.width / 2, rect.top + rect.height / 2); if (clip) playClip(clip);
    } else if (event.key === ' ') { event.preventDefault(); controller.toggle(); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomView(-6); }
    else if (event.key === '-') { event.preventDefault(); zoomView(6); }
  });
}

function setDrawer(open) {
  $('clip-drawer').hidden = !open; $('list-toggle').setAttribute('aria-expanded', String(open));
  $('list-toggle').setAttribute('aria-label', open ? 'Close clip library' : 'Open clip library');
  (open ? $('list-close') : $('list-toggle')).focus();
}

function filterGroup(group) {
  activeGroup = group;
  for (const clip of clips) {
    const visible = group === 'all' || String(clip.cluster) === group;
    points.get(clip.id).object3D.visible = visible; rows.get(clip.id).hidden = !visible;
    rows.get(clip.id).style.display = visible ? '' : 'none';
  }
  for (const button of $('group-filters').children) button.setAttribute('aria-pressed', String(button.dataset.group === group));
  clearHover();
}

function createPoints() {
  for (const clip of clips) {
    const point = document.createElement('a-box'); point.id = `point-${clip.id}`;
    point.dataset.clipId = clip.id; point.dataset.cluster = String(clip.cluster);
    point.setAttribute('position', clip.position.join(' '));
    for (const key of ['width', 'height', 'depth']) point.setAttribute(key, '4');
    point.setAttribute('material', 'shader: flat; color: #fff7e8');
    pointContainer.appendChild(point); points.set(clip.id, point);
    const row = document.createElement('button'); row.type = 'button'; row.className = 'clip-row'; row.dataset.clipId = clip.id;
    row.setAttribute('aria-label', `Play clip ${clip.number}, source ${formatTime(clip.start)}, ${groupName(clip.cluster)}`);
    const marker = document.createElement('span'); marker.className = 'clip-marker'; marker.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'), title = document.createElement('strong'), time = document.createElement('small');
    title.textContent = `Clip ${String(clip.number).padStart(3, '0')}`;
    time.textContent = `${formatTime(clip.start)}–${formatTime(clip.start + clip.duration)}`; text.append(title, time);
    const label = document.createElement('span'); label.className = 'group-label'; label.textContent = groupName(clip.cluster);
    row.append(marker, text, label); row.addEventListener('click', () => playClip(clip, true));
    $('clip-list').appendChild(row); rows.set(clip.id, row);
  }
  const groups = ['all', ...[...new Set(clips.map(clip => clip.cluster))].sort((a, b) => a - b).map(String)];
  for (const group of groups) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.group = group;
    button.textContent = group === 'all' ? 'All' : groupName(Number(group));
    button.setAttribute('aria-pressed', String(group === activeGroup)); button.addEventListener('click', () => filterGroup(group));
    $('group-filters').appendChild(button);
  }
  updatePoints();
}

function waitForScene() {
  return new Promise((resolve, reject) => {
    if (scene.hasLoaded && scene.canvas && scene.camera) { resolve(); return; }
    const timer = setTimeout(() => reject(new Error('The 3D scene took too long to load. Please reload.')), 25000);
    scene.addEventListener('renderstart', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

async function waitForPanorama() {
  const image = $('b1-panorama'); if (image.complete && image.naturalWidth > 0) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The panorama took too long to load. Please reload.')), 25000);
    image.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
    image.addEventListener('error', () => { clearTimeout(timer); reject(new Error('The panorama could not be found. Check the local image file.')); }, { once: true });
  });
}

async function boot() {
  if (!window.AFRAME) throw new Error('The 3D engine could not load. Please reload the page.');
  const response = await fetch(COORDINATES_URL);
  if (!response.ok) throw new Error('The sound map could not load. Open this page through the local HTTP server.');
  const sourceRows = await response.json();
  clips = createClips(sourceRows, document.baseURI);
  const THREE = window.AFRAME.THREE;
  raycaster = new THREE.Raycaster(); raycaster.far = 400; pointerNDC = new THREE.Vector2();
  listenerForward = new THREE.Vector3(); listenerUp = new THREE.Vector3(); cameraQuaternion = new THREE.Quaternion();
  await Promise.all([waitForScene(), waitForPanorama()]);
  createPoints(); setupNavigation(); orientCamera();
  $('point-count').textContent = clips.length;
  $('load-status').textContent = ''; $('load-status').hidden = true;
  enterButton.textContent = 'Start exploring'; enterButton.disabled = false; scene.dataset.ready = 'true';
}

enterButton.addEventListener('click', async () => {
  if (scene.dataset.ready !== 'true') { location.reload(); return; }
  started = true; $('intro').hidden = true; $('experience').inert = false; canvas.focus({ preventScroll: true });
  try { await prepareSpatialAudio(); } catch (error) { console.warn('Spatial audio unavailable:', error); }
});
$('play-pause').addEventListener('click', () => controller.toggle());
$('replay').addEventListener('click', () => controller.play(undefined, { restart: true }));
$('stop').addEventListener('click', () => controller.stop());
$('seek').addEventListener('input', event => controller.seek(Number(event.target.value)));
$('volume').addEventListener('input', event => controller.setVolume(Number(event.target.value) / 100));
$('reset-view').addEventListener('click', () => { yaw = 0; pitch = 0; zoomView(DEFAULT_FOV - fieldOfView); orientCamera(); clearHover(); canvas.focus({ preventScroll: true }); });
$('zoom-out').addEventListener('click', () => zoomView(6));
$('zoom-in').addEventListener('click', () => zoomView(-6));
$('list-toggle').addEventListener('click', () => setDrawer($('clip-drawer').hidden));
$('list-close').addEventListener('click', () => setDrawer(false));
$('help-toggle').addEventListener('click', () => $('help-dialog').showModal());
$('about-toggle').addEventListener('click', () => $('about-dialog').showModal());
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { notify('Page fullscreen is unavailable. You can use your browser’s fullscreen mode.'); }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { controller.stop(); if (!$('clip-drawer').hidden) setDrawer(false); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && ['playing', 'loading'].includes(controller.status)) controller.pause(); });
window.addEventListener('pagehide', () => controller.stop());
boot().catch(error => { console.error('Scene initialization failed:', error); $('load-status').hidden = false; $('load-status').textContent = error.message; enterButton.textContent = 'Reload'; enterButton.disabled = false; });
