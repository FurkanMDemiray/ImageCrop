import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Image,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  GestureResponderEvent,
  PanResponder,
} from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  ImagePickerResponse,
  Asset,
} from 'react-native-image-picker';
import ImageEditor from '@react-native-community/image-editor';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CroppedImage {
  uri: string;
  cropRegion: CropRegion;
}

interface Box {
  x: number; // absolute page X (left edge)
  y: number; // absolute page Y (top edge)
  w: number;
  h: number;
}

type Handle = 'tl' | 'tr' | 'bl' | 'br' | 'move' | null;

interface Props {
  onCropComplete: (result: CroppedImage) => void;
  onCancel?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HS = 22; // handle visual size
const HIT = 40; // handle hit slop (bigger = easier to grab on simulator)
const MIN = 60; // minimum crop dimension in px

// ─── Helpers ──────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/**
 * Given a container's page position + size, and the natural image dimensions,
 * returns the rect (in page/absolute coords) where the image actually renders
 * under resizeMode="contain".
 */
function containRect(
  cX: number,
  cY: number,
  cW: number,
  cH: number,
  imgW: number,
  imgH: number,
): { x: number; y: number; w: number; h: number } {
  const cRatio = cW / cH;
  const iRatio = imgW / imgH;
  let w: number, h: number;
  if (iRatio > cRatio) {
    w = cW;
    h = cW / iRatio;
  } else {
    h = cH;
    w = cH * iRatio;
  }
  return { x: cX + (cW - w) / 2, y: cY + (cH - h) / 2, w, h };
}

// ─── Component ────────────────────────────────────────────────────────────────

const ImageCropPicker: React.FC<Props> = ({ onCropComplete, onCancel }) => {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });
  const [modalVisible, setModalVisible] = useState(false);
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 0, h: 0 });
  const [isCropping, setIsCropping] = useState(false);

  // Refs so PanResponder callbacks never get stale closures
  const boxRef = useRef<Box>(box);
  const imgRect = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const activeHandle = useRef<Handle>(null);
  const lastPage = useRef({ x: 0, y: 0 });
  const containerRef = useRef<View>(null);

  const commitBox = (b: Box) => {
    boxRef.current = b;
    setBox(b);
  };

  // ─── Pickers ──────────────────────────────────────────────────────────────

  const onPickerResponse = (res: ImagePickerResponse) => {
    if (res.didCancel || res.errorCode) return;
    const asset: Asset | undefined = res.assets?.[0];
    if (!asset?.uri) return;
    setNaturalSize({ w: asset.width ?? 1, h: asset.height ?? 1 });
    setImageUri(asset.uri);
    setModalVisible(true);
  };

  const openGallery = () =>
    launchImageLibrary({ mediaType: 'photo', quality: 1 }, onPickerResponse);
  const openCamera = () =>
    launchCamera({ mediaType: 'photo', quality: 1 }, onPickerResponse);

  // Container layout
  // measureInWindow gives us true page coords — this is the key fix.

  const onContainerLayout = useCallback(() => {
    containerRef.current?.measureInWindow((px, py, pw, ph) => {
      const nat = naturalSize; // captured at call time; stable after picker
      const rect = containRect(px, py, pw, ph, nat.w, nat.h);
      imgRect.current = rect;

      // Use full image bounds (no margin)
      const bw = rect.w;
      const bh = rect.h;

      commitBox({
        x: rect.x,
        y: rect.y,
        w: bw,
        h: bh,
      });
    });
  }, [naturalSize]);

  // ─── Handle detection (uses page coords throughout) ───────────────────────

  const detectHandle = (px: number, py: number): Handle => {
    const b = boxRef.current;
    const near = (ax: number, ay: number) =>
      Math.abs(px - ax) < HIT && Math.abs(py - ay) < HIT;

    if (near(b.x, b.y)) return 'tl';
    if (near(b.x + b.w, b.y)) return 'tr';
    if (near(b.x, b.y + b.h)) return 'bl';
    if (near(b.x + b.w, b.y + b.h)) return 'br';
    if (px > b.x && px < b.x + b.w && py > b.y && py < b.y + b.h) return 'move';
    return null;
  };

  // ─── Crop box resize / move ───────────────────────────────────────────────

  const applyDelta = (handle: Handle, dx: number, dy: number) => {
    const b = boxRef.current;
    const img = imgRect.current;

    let { x, y, w, h } = b;

    switch (handle) {
      case 'move': {
        x = clamp(x + dx, img.x, img.x + img.w - w);
        y = clamp(y + dy, img.y, img.y + img.h - h);
        break;
      }
      case 'tl': {
        const anchorX = b.x + b.w;
        const anchorY = b.y + b.h;
        w = clamp(b.w - dx, MIN, anchorX - img.x);
        h = clamp(b.h - dy, MIN, anchorY - img.y);
        x = anchorX - w;
        y = anchorY - h;
        break;
      }
      case 'tr': {
        const anchorY = b.y + b.h;
        w = clamp(b.w + dx, MIN, img.x + img.w - b.x);
        h = clamp(b.h - dy, MIN, anchorY - img.y);
        x = b.x; // left edge fixed
        y = anchorY - h;
        break;
      }
      case 'bl': {
        const anchorX = b.x + b.w;
        w = clamp(b.w - dx, MIN, anchorX - img.x);
        h = clamp(b.h + dy, MIN, img.y + img.h - b.y);
        x = anchorX - w;
        y = b.y; // top edge fixed
        break;
      }
      case 'br': {
        w = clamp(b.w + dx, MIN, img.x + img.w - b.x);
        h = clamp(b.h + dy, MIN, img.y + img.h - b.y);
        x = b.x;
        y = b.y;
        break;
      }
    }

    // Guard: never escape image bounds
    x = clamp(x, img.x, img.x + img.w - w);
    y = clamp(y, img.y, img.y + img.h - h);

    commitBox({ x, y, w, h });
  };

  // ─── PanResponder ─────────────────────────────────────────────────────────

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (e: GestureResponderEvent) => {
        const { pageX, pageY } = e.nativeEvent;
        activeHandle.current = detectHandle(pageX, pageY);
        lastPage.current = { x: pageX, y: pageY };
      },

      onPanResponderMove: (e: GestureResponderEvent) => {
        const { pageX, pageY } = e.nativeEvent;
        const dx = pageX - lastPage.current.x;
        const dy = pageY - lastPage.current.y;
        lastPage.current = { x: pageX, y: pageY };
        if (activeHandle.current) applyDelta(activeHandle.current, dx, dy);
      },

      onPanResponderRelease: () => {
        activeHandle.current = null;
      },
    }),
  ).current;

  // ─── Confirm crop ─────────────────────────────────────────────────────────

  const confirmCrop = async () => {
    if (!imageUri || isCropping) return;

    setIsCropping(true);

    try {
      const img = imgRect.current;
      const b = boxRef.current;
      const scaleX = naturalSize.w / img.w;
      const scaleY = naturalSize.h / img.h;

      const cropOffset = {
        x: Math.round((b.x - img.x) * scaleX),
        y: Math.round((b.y - img.y) * scaleY),
      };
      const cropSize = {
        width: Math.round(b.w * scaleX),
        height: Math.round(b.h * scaleY),
      };

      const croppedResult = await ImageEditor.cropImage(imageUri, {
        offset: cropOffset,
        size: cropSize,
      });

      onCropComplete({
        uri: croppedResult.uri,
        cropRegion: {
          x: cropOffset.x,
          y: cropOffset.y,
          width: cropSize.width,
          height: cropSize.height,
        },
      });
    } catch (error) {
      console.error('Crop error:', error);
    } finally {
      setIsCropping(false);
      setModalVisible(false);
    }
  };

  const cancel = () => {
    if (isCropping) return;
    setModalVisible(false);
    setImageUri(null);
    onCancel?.();
  };

  // ─── Overlays ─────────────────────────────────────────────────────────────

  const renderOverlays = () => {
    const img = imgRect.current;
    const b = box;
    if (img.w === 0) return null;

    return (
      <>
        {/* 4 dark panels around crop box */}
        <View
          style={[
            st.overlay,
            { top: img.y, left: img.x, width: img.w, height: b.y - img.y },
          ]}
        />
        <View
          style={[
            st.overlay,
            {
              top: b.y + b.h,
              left: img.x,
              width: img.w,
              height: img.y + img.h - (b.y + b.h),
            },
          ]}
        />
        <View
          style={[
            st.overlay,
            { top: b.y, left: img.x, width: b.x - img.x, height: b.h },
          ]}
        />
        <View
          style={[
            st.overlay,
            {
              top: b.y,
              left: b.x + b.w,
              width: img.x + img.w - (b.x + b.w),
              height: b.h,
            },
          ]}
        />

        {/* Crop border */}
        <View
          pointerEvents="none"
          style={[
            st.cropBorder,
            { top: b.y, left: b.x, width: b.w, height: b.h },
          ]}
        >
          <View
            style={[st.grid, { left: '33%', top: 0, width: 1, height: '100%' }]}
          />
          <View
            style={[st.grid, { left: '66%', top: 0, width: 1, height: '100%' }]}
          />
          <View
            style={[st.grid, { top: '33%', left: 0, height: 1, width: '100%' }]}
          />
          <View
            style={[st.grid, { top: '66%', left: 0, height: 1, width: '100%' }]}
          />
        </View>

        {/* Corner handles */}
        {(
          [
            ['tl', b.x - HS / 2, b.y - HS / 2],
            ['tr', b.x + b.w - HS / 2, b.y - HS / 2],
            ['bl', b.x - HS / 2, b.y + b.h - HS / 2],
            ['br', b.x + b.w - HS / 2, b.y + b.h - HS / 2],
          ] as [string, number, number][]
        ).map(([key, lx, ly]) => (
          <View
            key={key}
            pointerEvents="none"
            style={[st.handle, { left: lx, top: ly }]}
          />
        ))}
      </>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={st.root}>
      <View style={st.pickerRow}>
        <Pressable style={st.btn} onPress={openGallery}>
          <Text style={st.btnTxt}>Galeri</Text>
        </Pressable>
        <Pressable style={st.btn} onPress={openCamera}>
          <Text style={st.btnTxt}>Kamera</Text>
        </Pressable>
      </View>

      <Modal visible={modalVisible} animationType="slide" statusBarTranslucent>
        <View style={st.modal}>
          <View
            ref={containerRef}
            style={st.imageContainer}
            onLayout={onContainerLayout}
            {...pan.panHandlers}
          >
            {imageUri && (
              <Image
                source={{ uri: imageUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
              />
            )}
            {renderOverlays()}
          </View>

          <View style={st.actions}>
            <Pressable
              style={[st.cancelBtn, isCropping && st.btnDisabled]}
              onPress={cancel}
              disabled={isCropping}
            >
              <Text style={st.cancelTxt}>
                {isCropping ? 'İşleniyor...' : 'İptal'}
              </Text>
            </Pressable>
            <Pressable
              style={[st.confirmBtn, isCropping && st.btnDisabled]}
              onPress={confirmCrop}
              disabled={isCropping}
            >
              {isCropping ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={st.confirmTxt}>Kırp</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pickerRow: { flexDirection: 'row', gap: 16 },
  btn: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnTxt: { color: '#e0e0ff', fontSize: 16, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#0d0d0d' },
  imageContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  cropBorder: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#fff',
    overflow: 'hidden',
  },
  grid: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.25)' },
  handle: {
    position: 'absolute',
    width: HS,
    height: HS,
    backgroundColor: '#fff',
    borderRadius: 3,
    borderWidth: 2,
    borderColor: '#1a1a2e',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#111',
  },
  cancelBtn: {
    flex: 1,
    marginRight: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  cancelTxt: { color: '#aaa', fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  confirmBtn: {
    flex: 1,
    marginLeft: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4f4fff',
    alignItems: 'center',
  },
  confirmTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default ImageCropPicker;
