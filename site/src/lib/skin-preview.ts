import type * as Three from "three";

export async function mountSkinPreview(host: HTMLElement): Promise<() => void> {
  const viewport = host.querySelector<HTMLElement>(".skin-preview__viewport")!;
  const status = host.querySelector<HTMLElement>("[role=status]")!;
  const buttons = [...host.querySelectorAll<HTMLButtonElement>("button[data-view]")];
  let renderer: Three.WebGLRenderer | undefined;
  let controls: import("three/addons/controls/OrbitControls.js").OrbitControls | undefined;
  let geometry: Three.BufferGeometry | undefined;
  let material: Three.MeshStandardMaterial | undefined;
  let texture: Three.Texture | undefined, glow: Three.Texture | undefined;
  let observer: ResizeObserver | undefined;
  let frame = 0;
  const events = new AbortController();
  const cleanup = () => {
    events.abort(); observer?.disconnect(); cancelAnimationFrame(frame); controls?.dispose();
    geometry?.dispose(); material?.dispose(); texture?.dispose(); glow?.dispose();
    renderer?.dispose(); renderer?.domElement.remove();
  };
  try {
    const [THREE, { OrbitControls }] = await Promise.all([import("three"), import("three/addons/controls/OrbitControls.js")]);
    const response = await fetch(host.dataset.model!, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Modelo no disponible");
    const mesh = await response.json();
    if (mesh.format !== "cobblecraft-mesh-v1" || !Array.isArray(mesh.positions) || mesh.positions.length % 9 || mesh.positions.length < 9 || mesh.positions.length > 300000 || !Array.isArray(mesh.uv) || mesh.uv.length !== mesh.positions.length / 3 * 2 || ![...mesh.positions, ...mesh.uv].every(Number.isFinite)) throw new Error("Geometría inválida");
    renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:"low-power", preserveDrawingBuffer:true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    viewport.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7e8997, 2.2));
    const light = new THREE.DirectionalLight(0xfff4e8, 2.3); light.position.set(-40, 65, 80); scene.add(light);
    const fill = new THREE.DirectionalLight(0xd9edff, 1.2); fill.position.set(40, 20, -35); scene.add(fill);
    const loader = new THREE.TextureLoader();
    [texture, glow] = await Promise.all([loader.loadAsync(host.dataset.texture!), loader.loadAsync(host.dataset.glow!)]);
    for (const map of [texture, glow]) {
      map.colorSpace = THREE.SRGBColorSpace; map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapLinearFilter;
    }
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(mesh.uv, 2));
    geometry.computeVertexNormals(); geometry.computeBoundingBox();
    material = new THREE.MeshStandardMaterial({ map:texture, emissiveMap:glow, emissive:0xffffff, emissiveIntensity:.7,
      roughness:.85, metalness:0, alphaTest:.12, side:THREE.DoubleSide });
    const model = new THREE.Mesh(geometry, material);
    const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    model.position.sub(center); scene.add(model);
    const radius = size.length() / 2;
    const camera = new THREE.PerspectiveCamera(34, 1, Math.max(.01,radius/100), radius*30);
    const fit = () => {
      const aspect = Math.max(.1, viewport.clientWidth / viewport.clientHeight);
      const distance = Math.max(size.y, size.x / aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov/2))) * 1.28 + size.z * .45;
      camera.aspect = aspect; camera.updateProjectionMatrix();
      return distance;
    };
    let distance = fit();
    camera.position.set(distance*.38, distance*.13, distance);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.minDistance = radius*.9; controls.maxDistance = distance*2;
    controls.minPolarAngle = .2; controls.maxPolarAngle = Math.PI*.85;
    // One-finger rotation, two-finger zoom; ordinary vertical page scrolling still works.
    renderer.domElement.style.touchAction = "pan-y";
    const render = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame=0; renderer?.render(scene,camera); });
    };
    controls.addEventListener("change",render);
    controls.update(); controls.saveState();
    observer = new ResizeObserver(() => {
      if (!renderer || !controls || !viewport.clientWidth || !viewport.clientHeight) return;
      const was = distance; distance = fit();
      camera.position.multiplyScalar(distance/was); controls.maxDistance = distance*2;
      renderer.setSize(viewport.clientWidth, viewport.clientHeight, false); render();
    });
    observer.observe(viewport);
    const action = (name: string) => {
      if (!controls) return;
      if (name === "reset") { camera.position.set(distance*.38,distance*.13,distance); controls.target.set(0,0,0); }
      else if (name === "in" || name === "out") {
        const next = THREE.MathUtils.clamp(camera.position.length()*(name==="in"?.84:1.19),controls.minDistance,controls.maxDistance);
        camera.position.setLength(next);
      } else camera.position.applyAxisAngle(new THREE.Vector3(0,1,0), name==="left"?-.3:.3);
      controls.update(); render();
    };
    for (const button of buttons) button.addEventListener("click",()=>action(button.dataset.view!),{signal:events.signal});
    viewport.addEventListener("keydown",event=>{
      const key = ({ArrowLeft:"left",ArrowRight:"right","+":"in","=":"in","-":"out",Home:"reset"} as Record<string,string>)[event.key];
      if(key){event.preventDefault();action(key);}
    },{signal:events.signal});
    renderer.domElement.addEventListener("webglcontextlost",event=>{
      event.preventDefault(); host.dataset.ready="false"; status.textContent="Vista 3D no disponible. Se muestra el icono de la skin.";
      buttons.forEach(b=>b.disabled=true); cleanup();
    },{signal:events.signal});
    renderer.setSize(viewport.clientWidth,viewport.clientHeight,false); renderer.render(scene,camera);
    host.dataset.ready = "true";
    return cleanup;
  } catch {
    cleanup(); host.dataset.ready="false"; host.dataset.failed="true";
    status.textContent="Vista 3D no disponible. Se muestra el icono de la skin.";
    buttons.forEach(button=>button.disabled=true);
    return () => {};
  }
}
