import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  type Frame,
} from 'react-native-vision-camera';
import { useFaceDetector, type Face, type FrameFaceDetectionOptions } from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';
import { theme } from '@/theme';
import type { LocalFile } from '@/services/resources/fileClient';

export interface FaceSelfieCaptureProps {
  onCapture: (file: LocalFile) => void;
  onCancel?: () => void;
  /** Consecutive good frames required before auto-capture (stability gate). */
  stableFrames?: number;
  /** Preferred camera to start with; falls back to the other if that one is missing. Default 'front'. */
  initialFacing?: 'front' | 'back';
}

type Guidance = 'searching' | 'multiple' | 'tooSmall' | 'offCenter' | 'notStraight' | 'hold' | 'ready';

const GUIDANCE_TEXT: Record<Guidance, string> = {
  searching: 'Position the face in the circle',
  multiple: 'Only one face should be visible',
  tooSmall: 'Move a little closer',
  offCenter: 'Center the face in the circle',
  notStraight: 'Look straight at the camera',
  hold: 'Hold still…',
  ready: 'Perfect — capturing',
};

export function FaceSelfieCapture({ onCapture, onCancel, stableFrames = 5, initialFacing = 'front' }: FaceSelfieCaptureProps) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<'front' | 'back'>(initialFacing);
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');
  const preferred = facing === 'front' ? frontDevice : backDevice;
  const fallback = facing === 'front' ? backDevice : frontDevice;
  const device = preferred ?? fallback;
  const activeFacing: 'front' | 'back' = preferred ? facing : (facing === 'front' ? 'back' : 'front');
  const bothCameras = Boolean(frontDevice && backDevice);
  const camera = useRef<Camera>(null);
  const faceOptions: FrameFaceDetectionOptions = {
    performanceMode: 'fast',
    classificationMode: 'none',
    landmarkMode: 'none',
    contourMode: 'none',
    cameraFacing: activeFacing,
    minFaceSize: 0.15,
  };
  const { detectFaces } = useFaceDetector(faceOptions);

  const [guidance, setGuidance] = useState<Guidance>('searching');
  const [capturing, setCapturing] = useState(false);
  const goodCount = useRef(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  const capture = useCallback(async () => {
    if (firedRef.current || !camera.current) return;
    firedRef.current = true;
    setCapturing(true);
    try {
      const photo = await camera.current.takePhoto({ flash: 'off' });
      const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      onCapture({ uri, name: 'selfie.jpg', mimeType: 'image/jpeg' });
    } catch {
      firedRef.current = false;
      setCapturing(false);
    }
  }, [onCapture]);

  const evaluate = useCallback((faces: Face[], frameWidth: number, frameHeight: number) => {
    if (firedRef.current) return;

    if (faces.length === 0) { goodCount.current = 0; setGuidance('searching'); return; }
    if (faces.length > 1) { goodCount.current = 0; setGuidance('multiple'); return; }

    const f = faces[0]!;
    const b = f.bounds;
    const faceRatio = b.width / frameWidth;
    if (faceRatio < 0.28) { goodCount.current = 0; setGuidance('tooSmall'); return; }

    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const offX = Math.abs(cx - frameWidth / 2) / frameWidth;
    const offY = Math.abs(cy - frameHeight / 2) / frameHeight;
    if (offX > 0.18 || offY > 0.2) { goodCount.current = 0; setGuidance('offCenter'); return; }

    if (Math.abs(f.yawAngle) > 18 || Math.abs(f.pitchAngle) > 18) { goodCount.current = 0; setGuidance('notStraight'); return; }

    goodCount.current += 1;
    if (goodCount.current >= stableFrames) {
      setGuidance('ready');
      void capture();
    } else {
      setGuidance('hold');
    }
  }, [capture, stableFrames]);

  const evaluateJs = Worklets.createRunOnJS(evaluate);

  const frameProcessor = useFrameProcessor((frame: Frame) => {
    'worklet';
    const faces = detectFaces(frame);
    evaluateJs(faces, frame.width, frame.height);
  }, [detectFaces, evaluateJs]);

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={40} color={theme.color.mutedText} />
        <Text style={styles.msg}>Camera access is needed for a verification selfie.</Text>
        <Pressable onPress={() => void requestPermission()} style={styles.btn}><Text style={styles.btnText}>Allow camera</Text></Pressable>
        {onCancel ? <Pressable onPress={onCancel} hitSlop={8}><Text style={styles.cancel}>Cancel</Text></Pressable> : null}
      </View>
    );
  }
  if (device == null) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={40} color={theme.color.mutedText} />
        <Text style={styles.msg}>No camera available on this device.</Text>
        {onCancel ? <Pressable onPress={onCancel} hitSlop={8}><Text style={styles.cancel}>Cancel</Text></Pressable> : null}
      </View>
    );
  }

  const ready = guidance === 'ready' || guidance === 'hold';

  return (
    <View style={styles.wrap}>
      <View style={[styles.ring, ready ? styles.ringReady : null]}>
        <Camera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
          photo
          frameProcessor={frameProcessor}
        />
      </View>
      <Text style={[styles.guidance, ready ? styles.guidanceReady : null]}>{GUIDANCE_TEXT[guidance]}</Text>
      {bothCameras ? (
        <Pressable
          onPress={() => { firedRef.current = false; goodCount.current = 0; setGuidance('searching'); setFacing((f) => (f === 'front' ? 'back' : 'front')); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Switch camera"
          style={styles.flipRow}
        >
          <Ionicons name="camera-reverse-outline" size={18} color={theme.color.primary} />
          <Text style={styles.flipText}>{activeFacing === 'front' ? 'Use back camera' : 'Use front camera'}</Text>
        </Pressable>
      ) : null}
      {capturing ? <ActivityIndicator color={theme.color.primary} style={styles.spinner} /> : null}
      {onCancel ? <Pressable onPress={onCancel} hitSlop={8} style={styles.cancelRow}><Text style={styles.cancel}>Cancel</Text></Pressable> : null}
    </View>
  );
}

const RING = 260;
const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: theme.spacing.md, alignSelf: 'stretch' },
  ring: {
    width: RING, height: RING, borderRadius: RING / 2, overflow: 'hidden',
    borderWidth: 4, borderColor: theme.color.border, backgroundColor: theme.color.accentSoft,
  },
  ringReady: { borderColor: theme.color.primary },
  guidance: { fontSize: theme.fontSize.label, color: theme.color.mutedText, fontWeight: '600', textAlign: 'center' },
  guidanceReady: { color: theme.color.primary, fontWeight: '800' },
  spinner: { marginTop: theme.spacing.xs },
  flipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: theme.spacing.xs },
  flipText: { fontSize: theme.fontSize.label, color: theme.color.primary, fontWeight: '700' },
  cancelRow: { paddingVertical: theme.spacing.xs },
  cancel: { fontSize: theme.fontSize.label, color: theme.color.mutedText, fontWeight: '700' },
  center: { alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.lg },
  msg: { fontSize: theme.fontSize.label, color: theme.color.mutedText, textAlign: 'center', lineHeight: 20 },
  btn: { minHeight: 48, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.color.primary, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: theme.color.primaryText, fontWeight: '800', fontSize: theme.fontSize.body },
});
