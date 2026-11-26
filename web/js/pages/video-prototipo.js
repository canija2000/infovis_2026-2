const viewport = document.getElementById("model-viewport");
const status = document.getElementById("model-status");
const detail = document.getElementById("component-detail");
const list = document.getElementById("component-list");
const tooltip = document.getElementById("model-tooltip");
const openModel = document.getElementById("open-model");
const showPhone = document.getElementById("show-phone");
const homeDetail = detail.innerHTML;

const components = [
  {
    id: "phone",
    name: "Teléfono",
    match: /^Teléfono/,
    category: "Imagen y experiencia",
    description:
      "Referencia opcional: muestra el Mirador en la ranura lateral y se conecta al Leonardo por USB. Las fotos del ensamble fueron tomadas sin el teléfono colocado.",
  },
  {
    id: "arduino",
    name: "Arduino Leonardo",
    match: /^Arduino Leonardo/,
    category: "Control del circuito",
    description:
      "Recibe los mensajes MIDI del Mirador por USB y controla los cuatro motores desde los pines 10, 8, 6 y 4. Está montado vertical y recto en la pared interior de la mochila, con el puerto USB hacia la abertura lateral del cable.",
  },
  {
    id: "breadboard",
    name: "Protoboard",
    match: /^Protoboard/,
    category: "Conexiones",
    description:
      "Base de conexiones del circuito de vibración. Está en el piso de la mochila, centrada cerca de la apertura trasera, frente al Arduino montado verticalmente.",
  },
  {
    id: "motor-1",
    name: "Motor izquierdo delantero",
    match: /^Motor izq adelante/,
    category: "Zona superior izquierda · pin 10",
    description:
      "Motor 1, en la parte delantera del asa izquierda. Traduce en vibración la actividad de las bandadas de la zona superior izquierda del Mirador.",
  },
  {
    id: "motor-2",
    name: "Motor derecho delantero",
    match: /^Motor der adelante/,
    category: "Zona superior derecha · pin 8",
    description:
      "Motor 2, en la parte delantera del asa derecha. Traduce en vibración la actividad de las bandadas de la zona superior derecha del Mirador.",
  },
  {
    id: "motor-3",
    name: "Motor izquierdo trasero",
    match: /^Motor izq atrás/,
    category: "Zona inferior izquierda · pin 6",
    description:
      "Motor 3, en la parte trasera del asa izquierda. Traduce en vibración la actividad de las bandadas de la zona inferior izquierda del Mirador.",
  },
  {
    id: "motor-4",
    name: "Motor derecho trasero",
    match: /^Motor der atrás/,
    category: "Zona inferior derecha · pin 4",
    description:
      "Motor 4, en la parte trasera del asa derecha. Traduce en vibración la actividad de las bandadas de la zona inferior derecha del Mirador.",
  },
  {
    id: "wires",
    name: "Cables de los motores",
    match: /^Cable motor/,
    category: "Circuito de vibración",
    description:
      "Salen por la cara inferior de las asas invertidas y recorren los costados, con conectores negros en línea, hasta los pasos de la mochila. El recorrido se reconstruyó a partir de las fotos.",
  },
  {
    id: "usb",
    name: "Conexión USB",
    match: /^USB/,
    category: "Teléfono y Arduino",
    description:
      "Cable del Arduino Leonardo para conectar el teléfono. En las fotos sale por el paso lateral de la mochila y queda libre, sin el teléfono conectado.",
  },
];

let selectComponent = (component) => showDetail(component);
for (const component of components) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = component.name;
  button.dataset.component = component.id;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => selectComponent(component));
  list.append(button);
}

function showDetail(component) {
  if (!component) {
    detail.innerHTML = homeDetail;
    return;
  }
  const category = document.createElement("p");
  category.className = "eyebrow";
  category.textContent = component.category;
  const name = document.createElement("h3");
  name.textContent = component.name;
  const description = document.createElement("p");
  description.textContent = component.description;
  detail.replaceChildren(category, name, description);
}

function failed(error) {
  console.error("No se pudo iniciar el visor 3D:", error);
  viewport.setAttribute("aria-busy", "false");
  viewport.dataset.state = "error";
  document.getElementById("model-fallback").hidden = false;
  viewport.querySelector("canvas")?.remove();
  document
    .querySelectorAll(".model-toolbar button, .model-toolbar input")
    .forEach((control) => {
      control.disabled = true;
    });
  tooltip.hidden = true;
  status.textContent =
    "No se pudo mostrar el modelo interactivo. Puedes consultar los componentes o descargar el archivo 3D. Para reintentar, recarga la página.";
  selectComponent = (component) => showDetail(component);
}

async function startViewer() {
  const [THREE, { OrbitControls }, { GLTFLoader }] = await Promise.all([
    import("../../vendor/three/three.module.js"),
    import("../../vendor/three/OrbitControls.js"),
    import("../../vendor/three/GLTFLoader.js"),
  ]);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Modelo 3D interactivo del Visor de Bandadas",
  );
  canvas.setAttribute("aria-describedby", "model-help model-status");
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    failed(new Error("Se perdió el contexto WebGL"));
  });
  viewport.append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
  const controls = new OrbitControls(camera, canvas);
  controls.screenSpacePanning = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x969ba5, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.55);
  sun.position.set(-300, 500, 400);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.2);
  fill.position.set(300, 100, -400);
  scene.add(fill);
  const grid = new THREE.GridHelper(700, 28, 0xb6c3cf, 0xd7dfe7);
  scene.add(grid);
  const render = () => renderer.render(scene, camera);
  controls.addEventListener("change", render);
  const resize = () => {
    const width = viewport.clientWidth,
      height = viewport.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (ready) resetView(false);
    render();
  };
  let ready = false;
  new ResizeObserver(resize).observe(viewport);
  resize();

  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().load(
      "models/visor-bandadas/ensamble.glb",
      resolve,
      undefined,
      reject,
    );
  });
  const root = gltf.scene;
  // The built visor rests on the opposite face from the CAD's up axis.
  // Flip the whole assembly around its longitudinal axis, keeping its parts together.
  root.rotation.z = Math.PI;
  scene.add(root);
  const pieces = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const name = object.name.replace(/_/g, " ");
    object.userData.component = components.find((component) =>
      component.match.test(name),
    );
    object.userData.name = name;
    object.userData.referenceOnly = /^Teléfono/.test(name);
    object.userData.cover =
      /^(VISOR BASE|ASA |MOCHILA ABAJO|MOCHILA TAPA|LISTON TAPA)/.test(name);
    object.material = object.material.clone();
    object.material.side = THREE.DoubleSide;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(object.geometry, 40),
      new THREE.LineBasicMaterial({
        color: 0x303b48,
        transparent: true,
        opacity: 0.35,
      }),
    );
    object.add(edges);
    pieces.push(object);
  });
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  grid.position.set(center.x, box.min.y - 1, center.z);
  controls.minDistance = size * 0.25;
  controls.maxDistance = size * 5;
  let selected = null;
  let hovered = null;
  let mode = "rotate";

  function highlight(component) {
    for (const object of pieces) {
      object.material.emissive?.setHex(
        object.userData.component === component && component
          ? 0x183b74
          : 0x000000,
      );
      object.material.emissiveIntensity = 0.5;
    }
    render();
  }

  function clearHover() {
    tooltip.hidden = true;
    if (!hovered) return;
    hovered = null;
    showDetail(selected);
    highlight(selected);
  }

  function applyOpen() {
    clearHover();
    for (const object of pieces)
      object.visible =
        (!openModel.checked || !object.userData.cover) &&
        (!object.userData.referenceOnly || showPhone.checked);
    status.textContent = openModel.checked
      ? "Carcasa abierta · pasa el mouse por los componentes para conocer su función."
      : "Modelo listo · ensamble completo. Abre la carcasa para explorar la electrónica.";
    render();
  }

  function setMode(nextMode) {
    mode = nextMode;
    controls.mouseButtons.LEFT =
      mode === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    document
      .getElementById("rotate-model")
      .setAttribute("aria-pressed", String(mode === "rotate"));
    document
      .getElementById("pan-model")
      .setAttribute("aria-pressed", String(mode === "pan"));
  }

  function resetView(resetAll = true) {
    if (resetAll) {
      selected = null;
      clearHover();
      openModel.checked = false;
      showPhone.checked = false;
      applyOpen();
      setMode("rotate");
      list
        .querySelectorAll("button")
        .forEach((button) => button.setAttribute("aria-pressed", "false"));
      showDetail(null);
      highlight(null);
    }
    const distance = (size * 1.3) / Math.min(1, camera.aspect);
    controls.maxDistance = Math.max(size * 5, distance * 1.2);
    controls.target.copy(center);
    camera.position
      .copy(center)
      .add(
        new THREE.Vector3(-0.75, 0.6, 0.85)
          .normalize()
          .multiplyScalar(distance),
      );
    controls.update();
    render();
  }

  function zoom(factor) {
    const offset = camera.position.clone().sub(controls.target);
    const distance = THREE.MathUtils.clamp(
      offset.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    );
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
    clearHover();
    render();
  }

  selectComponent = (component) => {
    selected = component;
    openModel.checked = true;
    if (component.id === "phone") showPhone.checked = true;
    applyOpen();
    showDetail(component);
    highlight(component);
    // Look into the rear compartment for the boards and along each handle
    // for its motors, keeping the entire assembly in view.
    const direction = ["arduino", "breadboard", "usb"].includes(component.id)
      ? new THREE.Vector3(-0.7, 1.1, -1)
      : new THREE.Vector3(
          component.id === "motor-2" || component.id === "motor-4" ? 1 : -1,
          0.8,
          0.9,
        );
    // Left/right in world space also changes when the assembly turns over.
    direction.x *= -1;
    controls.target.copy(center);
    camera.position
      .copy(center)
      .add(
        direction
          .normalize()
          .multiplyScalar((size * 1.3) / Math.min(1, camera.aspect)),
      );
    controls.update();
    render();
    list
      .querySelectorAll("button")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.component === component.id),
        ),
      );
  };
  openModel.addEventListener("change", applyOpen);
  showPhone.addEventListener("change", applyOpen);
  document
    .getElementById("reset-model")
    .addEventListener("click", () => resetView());
  document
    .getElementById("rotate-model")
    .addEventListener("click", () => setMode("rotate"));
  document
    .getElementById("pan-model")
    .addEventListener("click", () => setMode("pan"));
  document.getElementById("zoom-in").addEventListener("click", () => zoom(0.8));
  document
    .getElementById("zoom-out")
    .addEventListener("click", () => zoom(1.25));

  canvas.addEventListener("keydown", (event) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "=",
        "-",
        "Home",
        "Escape",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    clearHover();
    if (event.key === "Home") return resetView();
    if (event.key === "Escape") {
      selected = null;
      showDetail(null);
      highlight(null);
      list
        .querySelectorAll("button")
        .forEach((button) => button.setAttribute("aria-pressed", "false"));
      return;
    }
    if (["+", "=", "-"].includes(event.key))
      return zoom(event.key === "-" ? 1.15 : 0.87);
    const horizontal =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const vertical =
      event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (mode === "pan" || event.shiftKey) {
      const shift = new THREE.Vector3()
        .setFromMatrixColumn(camera.matrix, 0)
        .multiplyScalar(horizontal * size * 0.04);
      shift.addScaledVector(
        new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1),
        -vertical * size * 0.04,
      );
      camera.position.add(shift);
      controls.target.add(shift);
    } else {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta += horizontal * 0.12;
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi + vertical * 0.12,
        0.05,
        Math.PI - 0.05,
      );
      camera.position
        .copy(controls.target)
        .add(new THREE.Vector3().setFromSpherical(spherical));
    }
    controls.update();
    render();
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function inspect(event, tapped = false) {
    if (event.buttons || (!tapped && event.pointerType === "touch"))
      return clearHover();
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left,
      y = event.clientY - bounds.top;
    pointer.set((x / bounds.width) * 2 - 1, (-y / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(
      pieces.filter((object) => object.visible),
      false,
    )[0];
    if (!hit) return clearHover();
    const component = hit.object.userData.component;
    const name = document.createElement("strong");
    name.textContent = component?.name || hit.object.userData.name;
    tooltip.replaceChildren(name);
    if (component) {
      const description = document.createElement("span");
      description.textContent = component.description;
      tooltip.append(description);
    }
    tooltip.hidden = false;
    tooltip.style.left = `${Math.max(8, Math.min(x + 16, bounds.width - tooltip.offsetWidth - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(y + 16, bounds.height - tooltip.offsetHeight - 8))}px`;
    if (hovered !== component) {
      hovered = component;
      showDetail(component || selected);
      highlight(component || selected);
    }
    if (tapped && component) selectComponent(component);
  }
  let pointerStart = null;
  canvas.addEventListener("pointerdown", (event) => {
    pointerStart = [event.clientX, event.clientY];
    clearHover();
  });
  canvas.addEventListener("pointermove", (event) => inspect(event));
  canvas.addEventListener("pointerup", (event) => {
    if (
      pointerStart &&
      Math.hypot(
        event.clientX - pointerStart[0],
        event.clientY - pointerStart[1],
      ) < 5
    )
      inspect(event, true);
    pointerStart = null;
  });
  canvas.addEventListener("pointerleave", clearHover);
  canvas.addEventListener("wheel", clearHover, { passive: true });
  ready = true;
  resetView();
  document.getElementById("model-fallback").hidden = true;
  document
    .querySelectorAll(".model-toolbar button, .model-toolbar input")
    .forEach((control) => {
      control.disabled = false;
    });
  viewport.setAttribute("aria-busy", "false");
  viewport.dataset.state = "ready";
  status.textContent =
    "Modelo listo · ensamble completo. Abre la carcasa para explorar la electrónica.";
}

// Prioritize the video; download the 3D viewer only as it approaches the screen.
const observer = new IntersectionObserver(
  (entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    startViewer().catch(failed);
  },
  { rootMargin: "300px" },
);
observer.observe(viewport);
