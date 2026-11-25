import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

interface RobotCanvasProps {
  paused?: boolean;
  activeSection?: 'INTRO' | 'PRODUCT' | 'REVIEWS';
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

function createRoundedRectPath(w: number, h: number, r: number): THREE.Path {
  const p = new THREE.Path();
  const hw = w / 2;
  const hh = h / 2;
  p.moveTo(-hw + r, -hh);
  p.lineTo(hw - r, -hh);
  p.quadraticCurveTo(hw, -hh, hw, -hh + r);
  p.lineTo(hw, hh - r);
  p.quadraticCurveTo(hw, hh, hw - r, hh);
  p.lineTo(-hw + r, hh);
  p.quadraticCurveTo(-hw, hh, -hw, hh - r);
  p.lineTo(-hw, -hh + r);
  p.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return p;
}

function createGradientRingTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createConicGradient((200 * Math.PI) / 180, cx, cy);
  grad.addColorStop(0.0, '#ff3d8b');
  grad.addColorStop(0.16, '#ff5a5f');
  grad.addColorStop(0.32, '#ff8a3d');
  grad.addColorStop(0.5, '#ffb347');
  grad.addColorStop(0.68, '#ff8a3d');
  grad.addColorStop(0.84, '#ff5a5f');
  grad.addColorStop(1.0, '#ff3d8b');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(15, 14, 14, 0.55)');
  grad.addColorStop(0.55, 'rgba(15, 14, 14, 0.22)');
  grad.addColorStop(1, 'rgba(15, 14, 14, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export const RobotCanvas: React.FC<RobotCanvasProps> = ({
  paused = false,
  activeSection = 'INTRO',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL via GPU renderer string (never UA)
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.1, window.innerWidth < 900 ? 11.6 * 1.25 : 11.6);

    // Studio RoomEnvironment PMREM
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.9;
    pmrem.dispose();

    // Lighting rig matching spec
    const hemiLight = new THREE.HemisphereLight(0xfff6ee, 0xd9d2c8, 0.7);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff3e6, 1.7);
    keyLight.position.set(-3, 5, 4);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.radius = 6;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 18;
    keyLight.shadow.camera.left = -3.5;
    keyLight.shadow.camera.right = 3.5;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xfff0e6, 1.2);
    rimLight.position.set(4, 2, -4);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xff9a6a, 2.2, 6);
    fillLight.position.set(-3.2, 1.2, 0.6);
    scene.add(fillLight);

    // Materials
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0xeeebe6,
      roughness: 0.38,
      metalness: 0.02,
      clearcoat: 0.45,
      clearcoatRoughness: 0.3,
    });

    const shellLightMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8f6f2,
      roughness: 0.34,
      metalness: 0.02,
      clearcoat: 0.45,
      clearcoatRoughness: 0.3,
    });

    const darkJointMat = new THREE.MeshStandardMaterial({
      color: 0x1b1b1f,
      roughness: 0.55,
      metalness: 0.3,
    });

    const deepDarkMat = new THREE.MeshStandardMaterial({
      color: 0x0f0f12,
      roughness: 0.65,
      metalness: 0.25,
    });

    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x2a2928,
      roughness: 0.9,
      metalness: 0.04,
    });

    const ringTex = createGradientRingTexture(maxAniso);
    const ringMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: ringTex,
      emissive: 0xffffff,
      emissiveMap: ringTex,
      emissiveIntensity: 0.22,
      roughness: 0.5,
      metalness: 0.05,
      clearcoat: 0.35,
      clearcoatRoughness: 0.28,
    });

    // Dynamic 512px face canvas
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = 512;
    faceCanvas.height = 512;
    const faceCtx = faceCanvas.getContext('2d')!;
    const faceTex = new THREE.CanvasTexture(faceCanvas);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = maxAniso;

    const screenMat = new THREE.MeshPhysicalMaterial({
      color: 0x050507,
      roughness: 0.08,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      emissive: 0xffffff,
      emissiveMap: faceTex,
      emissiveIntensity: 1.6,
    });

    const ledMats = [0xff8a3d, 0xff5a5f, 0xff3d8b].map(
      (hex) =>
        new THREE.MeshStandardMaterial({
          color: hex,
          emissive: hex,
          emissiveIntensity: 1.4,
          roughness: 0.2,
        })
    );

    const geometries: THREE.BufferGeometry[] = [];
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };

    // Root assembly
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Pedestal (y = -2.22, height 1.6 -> top sits at -1.42)
    const pedestalGeo = trackGeo(new RoundedBoxGeometry(1.7, 1.6, 1.7, 3, 0.04));
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.set(0, -2.22, 0);
    pedestal.receiveShadow = true;
    rootGroup.add(pedestal);

    // Soft radial contact shadow on pedestal top
    const contactShadowTex = createContactShadowTexture();
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.52,
    });
    const contactDisc = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.76, 32)), contactShadowMat);
    contactDisc.rotation.x = -Math.PI / 2;
    contactDisc.position.set(0, -1.405, 0.04);
    rootGroup.add(contactDisc);

    // Robot body group
    const bodyGroup = new THREE.Group();
    rootGroup.add(bodyGroup);

    // --- HEAD (pivots at y = 0.78, center at +0.78 above pivot) ---
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.78, 0);
    bodyGroup.add(headPivot);

    const headInner = new THREE.Group();
    headInner.position.set(0, 0.78, 0);
    headPivot.add(headInner);

    // Skull
    const skull = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(1.5, 1.42, 1.3, 4, 0.2)),
      shellMat
    );
    skull.castShadow = true;
    skull.receiveShadow = true;
    headInner.add(skull);

    // Dark back block + 26 circuit bars (instanced)
    const backBlock = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(1.28, 1.14, 0.9, 3, 0.14)),
      darkJointMat
    );
    backBlock.position.set(0, 0.02, -0.34);
    backBlock.castShadow = true;
    headInner.add(backBlock);

    const barGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
    const circuitBars = new THREE.InstancedMesh(barGeo, deepDarkMat, 26);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 26; i++) {
      const onTop = i >= 18;
      if (!onTop) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        dummy.position.set(-0.34 + col * 0.34, -0.36 + row * 0.14, -0.8);
        dummy.scale.set(0.18 + ((i * 7) % 10) * 0.014, 0.032, 0.04);
      } else {
        const j = i - 18;
        dummy.position.set(-0.38 + (j % 4) * 0.25, 0.61, -0.58 + Math.floor(j / 4) * 0.2);
        dummy.scale.set(0.16, 0.03, 0.045);
      }
      dummy.updateMatrix();
      circuitBars.setMatrixAt(i, dummy.matrix);
    }
    circuitBars.instanceMatrix.needsUpdate = true;
    circuitBars.computeBoundingSphere();
    headInner.add(circuitBars);

    // Face ring (extruded rounded-rect frame with remapped UVs)
    const ringOuter = createRoundedRectShape(1.5, 1.44, 0.3);
    const ringInnerHole = createRoundedRectPath(1.08, 1.02, 0.2);
    ringOuter.holes.push(ringInnerHole);

    const ringGeo = trackGeo(
      new THREE.ExtrudeGeometry(ringOuter, {
        depth: 0.1,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 4,
        curveSegments: 20,
      })
    );
    ringGeo.computeBoundingBox();
    const bbox = ringGeo.boundingBox!;
    const sizeX = bbox.max.x - bbox.min.x;
    const sizeY = bbox.max.y - bbox.min.y;
    const posAttr = ringGeo.attributes.position;
    const uvAttr = ringGeo.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      const u = (posAttr.getX(i) - bbox.min.x) / sizeX;
      const v = (posAttr.getY(i) - bbox.min.y) / sizeY;
      uvAttr.setXY(i, u, v);
    }
    uvAttr.needsUpdate = true;

    const faceRing = new THREE.Mesh(ringGeo, ringMat);
    faceRing.position.set(0, 0, 0.6);
    faceRing.castShadow = true;
    headInner.add(faceRing);

    // Inner shell-light bezel at z = 0.62
    const bezelOuter = createRoundedRectShape(1.12, 1.06, 0.21);
    bezelOuter.holes.push(createRoundedRectPath(0.92, 0.86, 0.15));
    const bezelGeo = trackGeo(
      new THREE.ExtrudeGeometry(bezelOuter, {
        depth: 0.07,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.015,
        bevelSegments: 3,
        curveSegments: 16,
      })
    );
    const bezel = new THREE.Mesh(bezelGeo, shellLightMat);
    bezel.position.set(0, 0, 0.62);
    headInner.add(bezel);

    // Glossy black screen plate 0.9 x 0.84 at z = 0.66
    const screenShape = createRoundedRectShape(0.9, 0.84, 0.14);
    const screenGeo = trackGeo(new THREE.ShapeGeometry(screenShape, 18));
    // Remap screen UVs cleanly to [0, 1]
    const sPos = screenGeo.attributes.position;
    const sUv = screenGeo.attributes.uv;
    for (let i = 0; i < sPos.count; i++) {
      sUv.setXY(i, (sPos.getX(i) + 0.45) / 0.9, (sPos.getY(i) + 0.42) / 0.84);
    }
    sUv.needsUpdate = true;
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0, 0.675);
    headInner.add(screenMesh);

    // Ears (cylinders r = 0.22 on both sides + caps + right half-torus cable)
    const earGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 24));
    const earCapGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 20));
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(earGeo, shellLightMat);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(side * 0.82, -0.02, 0.04);
      ear.castShadow = true;
      headInner.add(ear);

      const cap = new THREE.Mesh(earCapGeo, darkJointMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(side * 0.85, -0.02, 0.04);
      headInner.add(cap);
    });

    const cableGeo = trackGeo(new THREE.TorusGeometry(0.24, 0.036, 12, 24, Math.PI));
    const cable = new THREE.Mesh(cableGeo, deepDarkMat);
    cable.position.set(0.84, -0.26, 0.02);
    cable.rotation.z = Math.PI;
    cable.rotation.y = Math.PI * 0.18;
    headInner.add(cable);

    // --- NECK ---
    const neck = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 0.34, 24)),
      darkJointMat
    );
    neck.position.set(0, 0.66, 0);
    bodyGroup.add(neck);

    // --- TORSO ---
    const torso = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(1.22, 1.12, 0.92, 4, 0.24)),
      shellMat
    );
    torso.position.set(0, 0.02, 0);
    torso.castShadow = true;
    torso.receiveShadow = true;
    bodyGroup.add(torso);

    const chestTop = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(0.98, 0.26, 0.78, 3, 0.1)),
      shellLightMat
    );
    chestTop.position.set(0, 0.48, 0.08);
    bodyGroup.add(chestTop);

    // 3 emissive chest LEDs
    const ledGeo = trackGeo(new THREE.SphereGeometry(0.036, 14, 14));
    ledMats.forEach((mat, idx) => {
      const led = new THREE.Mesh(ledGeo, mat);
      led.position.set(-0.22 + idx * 0.12, 0.22, 0.465);
      bodyGroup.add(led);
    });

    // Two dark vertical chest slots with half-torus lips above
    const slotGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.32, 0.05));
    const lipGeo = trackGeo(new THREE.TorusGeometry(0.055, 0.018, 10, 16, Math.PI));
    [-0.18, 0.18].forEach((sx) => {
      const slot = new THREE.Mesh(slotGeo, deepDarkMat);
      slot.position.set(sx, -0.14, 0.455);
      bodyGroup.add(slot);

      const lip = new THREE.Mesh(lipGeo, darkJointMat);
      lip.position.set(sx, 0.02, 0.455);
      bodyGroup.add(lip);
    });

    // Dark pelvis
    const pelvis = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(0.92, 0.34, 0.74, 3, 0.12)),
      darkJointMat
    );
    pelvis.position.set(0, -0.62, 0);
    pelvis.castShadow = true;
    bodyGroup.add(pelvis);

    // --- ARMS ---
    const shoulderGeo = trackGeo(new THREE.SphereGeometry(0.18, 18, 18));
    const upperArmGeo = trackGeo(new RoundedBoxGeometry(0.28, 0.5, 0.28, 3, 0.1));
    const elbowGeo = trackGeo(new THREE.SphereGeometry(0.13, 16, 16));
    const handGeo = trackGeo(new RoundedBoxGeometry(0.24, 0.38, 0.26, 3, 0.08));
    const thumbGeo = trackGeo(new RoundedBoxGeometry(0.09, 0.16, 0.1, 2, 0.03));

    const leftShoulderGroup = new THREE.Group();
    const rightShoulderGroup = new THREE.Group();
    const leftForearmGroup = new THREE.Group();
    const rightForearmGroup = new THREE.Group();

    const buildArm = (side: -1 | 1, shoulderGroup: THREE.Group, forearmGroup: THREE.Group) => {
      shoulderGroup.position.set(side * 0.76, 0.32, 0);
      shoulderGroup.rotation.z = side * 0.16;
      bodyGroup.add(shoulderGroup);

      const shoulderBall = new THREE.Mesh(shoulderGeo, darkJointMat);
      shoulderGroup.add(shoulderBall);

      const upperArm = new THREE.Mesh(upperArmGeo, shellMat);
      upperArm.position.set(0, -0.28, 0);
      upperArm.castShadow = true;
      shoulderGroup.add(upperArm);

      const elbow = new THREE.Mesh(elbowGeo, darkJointMat);
      elbow.position.set(0, -0.56, 0);
      shoulderGroup.add(elbow);

      forearmGroup.position.set(0, -0.56, 0);
      forearmGroup.rotation.x = -0.35;
      shoulderGroup.add(forearmGroup);

      const hand = new THREE.Mesh(handGeo, shellLightMat);
      hand.position.set(0, -0.24, 0);
      hand.castShadow = true;
      forearmGroup.add(hand);

      const thumb = new THREE.Mesh(thumbGeo, shellLightMat);
      thumb.position.set(-side * 0.14, -0.2, 0.08);
      thumb.rotation.z = side * 0.25;
      forearmGroup.add(thumb);
    };

    buildArm(-1, leftShoulderGroup, leftForearmGroup);
    buildArm(1, rightShoulderGroup, rightForearmGroup);

    // --- LEGS ---
    const hipGeo = trackGeo(new THREE.SphereGeometry(0.17, 16, 16));
    const legGeo = trackGeo(new RoundedBoxGeometry(0.34, 0.44, 0.36, 3, 0.11));
    const ankleGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 16));
    const footGeo = trackGeo(new RoundedBoxGeometry(0.38, 0.2, 0.52, 3, 0.08));

    [-1, 1].forEach((side) => {
      const hip = new THREE.Mesh(hipGeo, darkJointMat);
      hip.position.set(side * 0.3, -0.78, 0);
      bodyGroup.add(hip);

      const leg = new THREE.Mesh(legGeo, shellMat);
      leg.position.set(side * 0.3, -1.04, 0);
      leg.castShadow = true;
      bodyGroup.add(leg);

      const ankle = new THREE.Mesh(ankleGeo, darkJointMat);
      ankle.position.set(side * 0.3, -1.26, 0);
      bodyGroup.add(ankle);

      const foot = new THREE.Mesh(footGeo, shellLightMat);
      foot.position.set(side * 0.3, -1.32, 0.06);
      foot.castShadow = true;
      bodyGroup.add(foot);
    });

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Face drawing state
    let quoteMode = false;
    let faceFade = 1;
    let nextBlinkAt = 2.8;
    let blinkStart = -1;
    let lastBlinkScale = 1;
    let lastQuoteMode = false;
    let lastFaceFade = -1;

    const drawFace = (elapsed: number, isQuote: boolean) => {
      if (isQuote !== quoteMode) {
        quoteMode = isQuote;
        faceFade = 0;
      }
      if (faceFade < 1) {
        faceFade = Math.min(1, faceFade + 0.05);
      }

      let eyeScaleY = 1;
      if (!quoteMode) {
        if (elapsed >= nextBlinkAt && blinkStart < 0) {
          blinkStart = elapsed;
        }
        if (blinkStart >= 0) {
          const bt = (elapsed - blinkStart) / 0.18;
          if (bt >= 1) {
            blinkStart = -1;
            nextBlinkAt = elapsed + 2.5 + Math.random() * 3.0;
            eyeScaleY = 1;
          } else {
            const tri = bt < 0.5 ? bt * 2 : (1 - bt) * 2;
            eyeScaleY = 1 - tri * 0.9;
          }
        }
      }

      // Skip canvas redraw if unchanged
      if (
        Math.abs(eyeScaleY - lastBlinkScale) < 0.004 &&
        quoteMode === lastQuoteMode &&
        Math.abs(faceFade - lastFaceFade) < 0.004
      ) {
        return;
      }
      lastBlinkScale = eyeScaleY;
      lastQuoteMode = quoteMode;
      lastFaceFade = faceFade;

      faceCtx.fillStyle = '#040406';
      faceCtx.fillRect(0, 0, 512, 512);

      faceCtx.save();
      faceCtx.globalAlpha = faceFade;
      faceCtx.fillStyle = '#ffffff';
      faceCtx.shadowColor = 'rgba(255, 255, 255, 0.92)';
      faceCtx.shadowBlur = 18;

      if (quoteMode) {
        faceCtx.font = '900 460px "Arial Black", "Helvetica Neue", sans-serif';
        faceCtx.textAlign = 'center';
        faceCtx.textBaseline = 'alphabetic';
        faceCtx.fillText('“', 256, 515);
      } else {
        faceCtx.beginPath();
        faceCtx.ellipse(196, 262, 30, Math.max(3.5, 38 * eyeScaleY), 0, 0, Math.PI * 2);
        faceCtx.fill();

        faceCtx.beginPath();
        faceCtx.ellipse(316, 252, 30, Math.max(3.5, 38 * eyeScaleY), 0, 0, Math.PI * 2);
        faceCtx.fill();
      }
      faceCtx.restore();
      faceTex.needsUpdate = true;
    };

    // Initial face draw
    drawFace(0, false);

    // Motion state (pre-allocated scratch vectors)
    const lookTarget = new THREE.Vector3(0, 0.55, 0);
    let smoothScroll = Math.min(2, Math.max(0, window.scrollY / Math.max(window.innerHeight, 1)));
    let targetPtrX = 0;
    let targetPtrY = 0;
    let smoothPtrX = 0;
    let smoothPtrY = 0;
    let isMobile = window.innerWidth < 900 || window.innerHeight < 540;
    let isShortLandscape = window.innerWidth > window.innerHeight && window.innerHeight < 540;

    const onPointerMove = (e: PointerEvent) => {
      targetPtrX = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
      targetPtrY = (e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1;
    };

    const onResize = () => {
      const w = Math.max(window.innerWidth, 1);
      const h = Math.max(window.innerHeight, 1);
      isMobile = w < 900 || h < 540;
      isShortLandscape = w > h && h < 540;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const onOrientationChange = () => {
      window.setTimeout(onResize, 120);
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientationChange);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      if (pausedRef.current) {
        frameId = window.setTimeout(tick, 180);
        return;
      }

      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      const rawP = Math.min(2, Math.max(0, window.scrollY / Math.max(window.innerHeight, 1)));
      const scrollAlpha = 1 - Math.exp(-5.5 * dt);
      const ptrAlpha = 1 - Math.exp(-4.0 * dt);
      smoothScroll += (rawP - smoothScroll) * scrollAlpha;
      smoothPtrX += (targetPtrX - smoothPtrX) * ptrAlpha;
      smoothPtrY += (targetPtrY - smoothPtrY) * ptrAlpha;

      const t = easeInOutCubic(Math.min(1, smoothScroll));
      const baseZ = THREE.MathUtils.lerp(11.6, 6.9, t) * (isShortLandscape ? 1.32 : isMobile ? 1.22 : 1);
      const baseY = THREE.MathUtils.lerp(1.1, 1.95, t);
      const lookY = THREE.MathUtils.lerp(0.55, 1.72, t);
      const baseBodyYaw = THREE.MathUtils.lerp(-0.42, -0.2, t);
      const baseHeadYaw = THREE.MathUtils.lerp(-0.6, -0.06, t);
      const baseHeadPitch = THREE.MathUtils.lerp(0.16, 0.04, t);
      const baseHeadRoll = THREE.MathUtils.lerp(0.22, 0.0, t);

      camera.position.set(smoothPtrX * 0.25, baseY - smoothPtrY * 0.1, baseZ);
      lookTarget.set(0, lookY, 0);
      camera.lookAt(lookTarget);

      // Idle + pointer pose
      bodyGroup.position.y = Math.sin(elapsed * 1.4) * 0.02;
      bodyGroup.rotation.y = baseBodyYaw + smoothPtrX * 0.12;

      headPivot.rotation.y = baseHeadYaw + smoothPtrX * 0.45;
      headPivot.rotation.x = baseHeadPitch + smoothPtrY * 0.18 + Math.sin(elapsed * 0.9) * 0.02;
      headPivot.rotation.z = baseHeadRoll + Math.sin(elapsed * 0.7) * 0.02;

      leftShoulderGroup.rotation.x = Math.sin(elapsed * 1.4 - 1) * 0.05;
      rightShoulderGroup.rotation.x = Math.sin(elapsed * 1.4 + 1) * 0.05;
      leftForearmGroup.rotation.x = -0.35 + Math.sin(elapsed * 1.4 - 1) * 0.06;
      rightForearmGroup.rotation.x = -0.35 + Math.sin(elapsed * 1.4 + 1) * 0.06;

      drawFace(elapsed, smoothScroll > 1.55);

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientationChange);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);

      geometries.forEach((g) => g.dispose());
      shellMat.dispose();
      shellLightMat.dispose();
      darkJointMat.dispose();
      deepDarkMat.dispose();
      pedestalMat.dispose();
      ringMat.dispose();
      screenMat.dispose();
      contactShadowMat.dispose();
      ledMats.forEach((m) => m.dispose());
      ringTex.dispose();
      faceTex.dispose();
      contactShadowTex.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="nova-robot-canvas"
      data-section={activeSection}
      aria-hidden="true"
      className="fixed inset-0 z-[1] pointer-events-none"
    />
  );
};
