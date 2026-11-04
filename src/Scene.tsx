import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  EXTERNAL_BACKGROUND_RENDER_LAYER,
  getRenderGroupLayer,
  SceneObjectRenderer,
  SequentialRenderPasses,
  XRModel,
} from "@vincentt-xr/sdk";
import { useXRContext } from "@vincentt-xr/sdk/low-level";
import {
  createDefaultComponent,
  createOrderedComponentsSelector,
  createRenderPlan,
  createSceneObject,
  migrateToRenderGroups,
  type RenderGroupSceneObjectStore,
  type SceneComponent,
  type SceneComponentType,
  type SceneObject,
  type SceneObjectId,
  type SceneObjectStore,
} from "@vincentt-xr/sdk/scene-object";
import {
  FACE_RETOUCH_DEFAULT_CONTROLS,
  FaceRetouch,
  type FaceRetouchControls,
} from "@vincentt-xr/sdk/face-effects";

type EditorSceneStore = RenderGroupSceneObjectStore & {
  selectedObjectId: SceneObjectId;
};
type FaceLandmark = { y: number };
type FaceTrackingNode = {
  getDetectionResults: () =>
    | { faceLandmarks?: Array<Array<FaceLandmark>> }
    | undefined;
};

const selectOrderedComponents = createOrderedComponentsSelector();

const BUTTERFLY_OBJECT_NAME = "Butterfly GIF";
const BUTTERFLY_RED_OBJECT_NAME = "Butterfly Red GIF";
const FACE_RETOUCH_OBJECT_NAME = "Face Retouch";
const CLAP_PROMPT_OBJECT_NAME = "Clap Prompt Text";
const BUTTERFLY_HOME = { x: -275, y: -520 };
const BUTTERFLY_RED_HOME = { x: 275, y: 520 };
const FLIGHT_MS = 4200;
const COOLDOWN_MS = 1400;
const PROMPT_VISIBLE_MS = 4000;
const PROMPT_FADE_MS = 1000;
const CLOSE_FACE_HEIGHT = 0.34;
const FAR_FACE_HEIGHT = 0.18;

const isComponent = <TType extends SceneComponentType>(
  component: SceneComponent | undefined,
  type: TType,
): component is SceneComponent<TType> => component?.type === type;

const createInitialScene = (): EditorSceneStore => {
  // Full-screen jungle foreground GIF.
  const sceneGifObject = createSceneObject({
    name: "Scene 1 GIF",
    renderGroupId: "2d-foreground",
  });
  const sceneGifTransform = createDefaultComponent(
    "ScreenTransform",
    sceneGifObject.id,
  );
  const sceneGifImage = createDefaultComponent(
    "ScreenImage",
    sceneGifObject.id,
  );

  sceneGifTransform.settings.position = { x: 0, y: 0 };
  sceneGifTransform.settings.size = { width: 720, height: 1280 };
  sceneGifTransform.settings.showTransformGuides = false;

  sceneGifImage.settings.image.sourceKind = "gif";
  sceneGifImage.settings.image.src = "/images/scene-1.gif";
  sceneGifImage.settings.image.stretchMode = "fill";
  sceneGifImage.settings.transformation.position = { x: 0, y: 0 };
  sceneGifImage.settings.transformation.size = { width: 720, height: 1280 };
  sceneGifImage.settings.transformation.showFitGuides = false;
  sceneGifImage.settings.screenTransform = sceneGifTransform.settings;

  sceneGifObject.componentIds = [sceneGifTransform.id, sceneGifImage.id];

  // Face-tracked bug decoration; child position is local to the forehead anchor.
  const faceAnchorObject = createSceneObject({
    name: "Face Forehead Anchor",
    renderGroupId: "2d-foreground",
  });
  const faceAnchorTransform = createDefaultComponent(
    "ScreenTransform",
    faceAnchorObject.id,
  );
  const faceAnchor = createDefaultComponent(
    "TrackingAnchor",
    faceAnchorObject.id,
  );

  faceAnchorTransform.settings.position = { x: 0, y: 0 };
  faceAnchorTransform.settings.size = { width: 100, height: 100 };
  faceAnchor.settings.target = "face.forehead";
  faceAnchor.settings.smoothing = 15;
  faceAnchor.settings.followFaceRoll = true;

  const faceImageObject = createSceneObject({
    name: "Face 300 Image",
    parentObjectId: faceAnchorObject.id,
    renderGroupId: "2d-foreground",
  });
  const faceImageTransform = createDefaultComponent(
    "ScreenTransform",
    faceImageObject.id,
  );
  const faceImageComponent = createDefaultComponent(
    "ScreenImage",
    faceImageObject.id,
  );

  faceImageTransform.settings.position = { x: 0, y: 0 };
  faceImageTransform.settings.size = { width: 300, height: 300 };
  faceImageTransform.settings.showTransformGuides = false;
  faceImageComponent.settings.image.sourceKind = "gif";
  faceImageComponent.settings.image.src = "/images/small-bug.gif";
  faceImageComponent.settings.image.stretchMode = "fill";
  faceImageComponent.settings.transformation.position = { x: 0, y: 0 };
  faceImageComponent.settings.transformation.size = { width: 300, height: 300 };
  faceImageComponent.settings.transformation.showFitGuides = false;
  faceImageComponent.settings.screenTransform = faceImageTransform.settings;

  faceAnchorObject.componentIds = [faceAnchorTransform.id, faceAnchor.id];
  faceAnchorObject.childObjectIds = [faceImageObject.id];
  faceImageObject.componentIds = [faceImageTransform.id, faceImageComponent.id];

  // Top-left butterfly. Clap controller moves it subtly left-to-right.
  const butterflyObject = createSceneObject({
    name: BUTTERFLY_OBJECT_NAME,
    renderGroupId: "2d-foreground",
  });
  const butterflyTransform = createDefaultComponent(
    "ScreenTransform",
    butterflyObject.id,
  );
  const butterflyImage = createDefaultComponent(
    "ScreenImage",
    butterflyObject.id,
  );

  butterflyTransform.settings.position = BUTTERFLY_HOME;
  butterflyTransform.settings.size = { width: 180, height: 180 };
  butterflyImage.settings.image.sourceKind = "gif";
  butterflyImage.settings.image.src = "/images/butterfly.gif";
  butterflyImage.settings.image.stretchMode = "fill";
  butterflyImage.settings.transformation.position =
    butterflyTransform.settings.position;
  butterflyImage.settings.transformation.size =
    butterflyTransform.settings.size;
  butterflyImage.settings.screenTransform = butterflyTransform.settings;
  butterflyObject.componentIds = [butterflyTransform.id, butterflyImage.id];

  // Bottom-right butterfly. Same clap controller, opposite right-to-left path.
  const butterflyRedObject = createSceneObject({
    name: BUTTERFLY_RED_OBJECT_NAME,
    renderGroupId: "2d-foreground",
  });
  const butterflyRedTransform = createDefaultComponent(
    "ScreenTransform",
    butterflyRedObject.id,
  );
  const butterflyRedImage = createDefaultComponent(
    "ScreenImage",
    butterflyRedObject.id,
  );

  butterflyRedTransform.settings.position = BUTTERFLY_RED_HOME;
  butterflyRedTransform.settings.size = { width: 180, height: 180 };
  butterflyRedImage.settings.image.sourceKind = "gif";
  butterflyRedImage.settings.image.src = "/images/butterfly-red.gif";
  butterflyRedImage.settings.image.stretchMode = "fill";
  butterflyRedImage.settings.transformation.position =
    butterflyRedTransform.settings.position;
  butterflyRedImage.settings.transformation.size =
    butterflyRedTransform.settings.size;
  butterflyRedImage.settings.screenTransform = butterflyRedTransform.settings;
  butterflyRedObject.componentIds = [
    butterflyRedTransform.id,
    butterflyRedImage.id,
  ];

  const faceRetouchObject = createSceneObject({
    name: FACE_RETOUCH_OBJECT_NAME,
    renderGroupId: "2d-foreground",
  });
  const faceRetouchTransform = createDefaultComponent(
    "ScreenTransform",
    faceRetouchObject.id,
  );

  faceRetouchTransform.settings.enabled = false;
  faceRetouchObject.componentIds = [faceRetouchTransform.id];

  // Center prompt shown briefly on load, then dissolved by ClapPromptAnimator.
  const clapPromptObject = createSceneObject({
    name: CLAP_PROMPT_OBJECT_NAME,
    renderGroupId: "2d-foreground",
  });
  const clapPromptTransform = createDefaultComponent(
    "ScreenTransform",
    clapPromptObject.id,
  );
  const clapPromptText = createDefaultComponent("ScreenText", clapPromptObject.id);

  clapPromptTransform.settings.position = { x: 0, y: 0 };
  clapPromptTransform.settings.size = { width: 600, height: 90 };
  clapPromptTransform.settings.renderOrder = 1000;
  clapPromptTransform.settings.showTransformGuides = false;
  clapPromptText.settings.content.text = "Clap to see butterfly moving";
  clapPromptText.settings.transformation.position =
    clapPromptTransform.settings.position;
  clapPromptText.settings.transformation.size = clapPromptTransform.settings.size;
  clapPromptText.settings.transformation.renderOrder = 1000;
  clapPromptText.settings.transformation.showTransformGuides = false;
  clapPromptText.settings.screenTransform = clapPromptTransform.settings;
  clapPromptText.settings.style.fontSize = 44;
  clapPromptText.settings.style.fontWeight = "normal";
  clapPromptText.settings.style.color = "#f8fafc";
  clapPromptText.settings.style.opacity = 0.72;
  clapPromptText.settings.style.background.enabled = false;
  clapPromptText.settings.style.outlineEnabled = false;
  clapPromptText.settings.style.shadowEnabled = true;
  clapPromptText.settings.style.shadowLayers = [
    { color: "#123322", blur: 18, offsetX: 0, offsetY: 0, opacity: 0.75 },
  ];
  clapPromptObject.componentIds = [clapPromptTransform.id, clapPromptText.id];

  return migrateToRenderGroups(
    {
      selectedObjectId: sceneGifObject.id,
      objects: {
        [sceneGifObject.id]: sceneGifObject,
        [faceAnchorObject.id]: faceAnchorObject,
        [faceImageObject.id]: faceImageObject,
        [butterflyObject.id]: butterflyObject,
        [butterflyRedObject.id]: butterflyRedObject,
        [faceRetouchObject.id]: faceRetouchObject,
        [clapPromptObject.id]: clapPromptObject,
      },
      components: {
        [sceneGifTransform.id]: sceneGifTransform,
        [sceneGifImage.id]: sceneGifImage,
        [faceAnchorTransform.id]: faceAnchorTransform,
        [faceAnchor.id]: faceAnchor,
        [faceImageTransform.id]: faceImageTransform,
        [faceImageComponent.id]: faceImageComponent,
        [butterflyTransform.id]: butterflyTransform,
        [butterflyImage.id]: butterflyImage,
        [butterflyRedTransform.id]: butterflyRedTransform,
        [butterflyRedImage.id]: butterflyRedImage,
        [faceRetouchTransform.id]: faceRetouchTransform,
        [clapPromptTransform.id]: clapPromptTransform,
        [clapPromptText.id]: clapPromptText,
      },
    } satisfies SceneObjectStore & { selectedObjectId: SceneObjectId },
    [
      sceneGifObject.id,
      faceAnchorObject.id,
      faceImageObject.id,
      butterflyObject.id,
      butterflyRedObject.id,
      faceRetouchObject.id,
      clapPromptObject.id,
    ],
  );
};

const ButterflyPathAnimator = ({
  setScene,
}: {
  setScene: (updater: (current: EditorSceneStore) => EditorSceneStore) => void;
}) => {
  const flightStartedAtRef = useRef<number | null>(null);
  const cooldownUntilRef = useRef(0);

  // One shared trigger controls both butterflies.
  const triggerFlight = () => {
    const now = performance.now();
    if (flightStartedAtRef.current !== null || now < cooldownUntilRef.current)
      return;
    flightStartedAtRef.current = now;
  };

  useEffect(() => {
    let audioContext: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let baseline = 0.03;
    let lastHitAt = 0;

    const startClapDetection = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      const read = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        let peak = 0;
        samples.forEach((sample) => {
          const value = Math.abs((sample - 128) / 128);
          sum += value * value;
          peak = Math.max(peak, value);
        });
        const rms = Math.sqrt(sum / samples.length);
        baseline = baseline * 0.96 + rms * 0.04;

        const now = performance.now();
        if (
          peak > 0.55 &&
          rms > Math.max(0.14, baseline * 3.2) &&
          now - lastHitAt > 450
        ) {
          lastHitAt = now;
          triggerFlight();
        }
        rafId = requestAnimationFrame(read);
      };

      read();
    };

    const tapFallback = () => triggerFlight();
    window.addEventListener("pointerdown", tapFallback);
    startClapDetection().catch(() => {
      // Tap fallback remains active when mic permission is unavailable.
    });

    return () => {
      window.removeEventListener("pointerdown", tapFallback);
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext) {
        audioContext.close().catch(() => {});
      }
    };
  }, []);

  useFrame(({ clock }) => {
    const now = performance.now();
    const startedAt = flightStartedAtRef.current;
    const flightProgress =
      startedAt === null ? 0 : Math.min((now - startedAt) / FLIGHT_MS, 1);
    const inFlight = startedAt !== null && flightProgress < 1;
    const ease = inFlight
      ? 0.5 - Math.cos(flightProgress * Math.PI * 2) / 2
      : 0;
    const flutter = Math.sin(flightProgress * Math.PI * 12);
    const t = clock.elapsedTime;

    if (startedAt !== null && flightProgress >= 1) {
      flightStartedAtRef.current = null;
      cooldownUntilRef.current = now + COOLDOWN_MS;
    }

    const positions = {
      [BUTTERFLY_OBJECT_NAME]: {
        x:
          BUTTERFLY_HOME.x +
          Math.sin(t * 0.9) * 12 +
          Math.sin(t * 1.7) * 5 +
          ease * 135,
        y:
          BUTTERFLY_HOME.y +
          Math.cos(t * 1.1) * 6 +
          ease * (-8 + Math.abs(flutter) * 5),
      },
      [BUTTERFLY_RED_OBJECT_NAME]: {
        x:
          BUTTERFLY_RED_HOME.x +
          Math.sin(t * 0.8 + 1.2) * 12 +
          Math.sin(t * 1.4) * 5 -
          ease * 135,
        y:
          BUTTERFLY_RED_HOME.y +
          Math.cos(t * 1.0 + 0.7) * 6 +
          ease * (-8 + Math.abs(flutter) * 5),
      },
    };

    setScene((current: EditorSceneStore) => {
      const components = { ...current.components };
      let changed = false;

      (Object.values(current.objects) as SceneObject[]).forEach((object) => {
        const position = positions[object.name as keyof typeof positions];
        if (!position) return;
        const transform = selectOrderedComponents(current, object.id).find(
          (component: SceneComponent) => component.type === "ScreenTransform",
        );
        if (!isComponent(transform, "ScreenTransform")) return;
        components[transform.id] = {
          ...transform,
          settings: { ...transform.settings, position },
        };
        changed = true;
      });

      return changed ? { ...current, components } : current;
    });
  });

  return null;
};

const ClapPromptAnimator = ({
  setScene,
}: {
  setScene: (updater: (current: EditorSceneStore) => EditorSceneStore) => void;
}) => {
  useFrame(({ clock }) => {
    const elapsedMs = clock.elapsedTime * 1000;
    const fadeProgress = Math.max(
      0,
      Math.min((elapsedMs - PROMPT_VISIBLE_MS) / PROMPT_FADE_MS, 1),
    );
    const opacity = 0.72 * (1 - fadeProgress);

    setScene((current: EditorSceneStore) => {
      const object = (Object.values(current.objects) as SceneObject[]).find(
        (entry) => entry.name === CLAP_PROMPT_OBJECT_NAME,
      );
      if (!object) return current;

      const text = selectOrderedComponents(current, object.id).find(
        (component: SceneComponent) => component.type === "ScreenText",
      );
      if (!isComponent(text, "ScreenText")) return current;

      return {
        ...current,
        objects: {
          ...current.objects,
          [object.id]: { ...object, enabled: opacity > 0 },
        },
        components: {
          ...current.components,
          [text.id]: {
            ...text,
            settings: {
              ...text.settings,
              style: { ...text.settings.style, opacity },
            },
          },
        },
      };
    });
  });

  return null;
};

const DynamicFaceRetouch = () => {
  const { session } = useXRContext();
  const [controls, setControls] = useState<FaceRetouchControls>(
    FACE_RETOUCH_DEFAULT_CONTROLS,
  );

  useFrame(() => {
    const landmarks = session
      .getModelNode<FaceTrackingNode>(XRModel.FACE_TRACKER)
      ?.getDetectionResults()
      ?.faceLandmarks?.[0];
    if (!landmarks?.length) return;

    const bounds = landmarks.reduce(
      (current, landmark) => ({
        minY: Math.min(current.minY, landmark.y),
        maxY: Math.max(current.maxY, landmark.y),
      }),
      { minY: Infinity, maxY: -Infinity },
    );
    const faceHeight = bounds.maxY - bounds.minY;
    const closeAmount = Math.max(
      0,
      Math.min((faceHeight - FAR_FACE_HEIGHT) / (CLOSE_FACE_HEIGHT - FAR_FACE_HEIGHT), 1),
    );

    setControls({
      skinSmoothing: closeAmount * 0.55,
      skinRealism: 0.82 - closeAmount * 0.2,
      blemishReduction: closeAmount * 0.35,
      previewMask: false,
    });
  });

  return <FaceRetouch {...controls} />;
};

export const Scene = () => {
  const [scene, setScene] = useState<EditorSceneStore>(() =>
    createInitialScene(),
  );

  const renderPlan = useMemo(() => createRenderPlan(scene), [scene]);
  const renderPassLayers = useMemo(
    () => [
      EXTERNAL_BACKGROUND_RENDER_LAYER,
      ...scene.renderGroupOrder.flatMap(
        (groupId: string, groupIndex: number) => {
          const group = scene.renderGroups[groupId];
          const hasRenderableObject = group?.objectIds.some(
            (objectId: string) => scene.objects[objectId]?.enabled,
          );
          return group?.enabled && hasRenderableObject
            ? [getRenderGroupLayer(groupIndex)]
            : [];
        },
      ),
    ],
    [scene],
  );

  const replaceComponent = (component: SceneComponent) => {
    setScene((current: EditorSceneStore) => ({
      ...current,
      components: { ...current.components, [component.id]: component },
    }));
  };

  return (
    <>
      <DynamicFaceRetouch />
      <ButterflyPathAnimator setScene={setScene} />
      <ClapPromptAnimator setScene={setScene} />
      <SequentialRenderPasses layers={renderPassLayers} />
      {renderPlan.map((entry) => (
        <SceneObjectRenderer
          key={entry.objectId}
          objectId={entry.objectId}
          store={scene}
          renderOrder={entry.renderOrder}
          renderLayer={entry.renderLayer}
          editorMode={false}
          onComponentChange={replaceComponent}
        />
      ))}
    </>
  );
};
