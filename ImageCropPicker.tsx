import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Modal,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Alert,
  Platform,
} from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  ImagePickerResponse,
  Asset,
} from 'react-native-image-picker';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

export type AspectRatio = 'free' | '1:1' | '16:9' | '4:3';

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CroppedImage {
  uri: string;
  width: number;
  height: number;
  cropRegion: CropRegion;
}

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragHandle = 'move' | 'tl' | 'tr' | 'bl' | 'br' | null;

interface ImageCropPickerProps {
  onCropComplete: (result: CroppedImage) => void;
  onCancel?: () => void;
  aspectRatio?: AspectRatio;
  quality?: number; // 0–1
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HANDLE_SIZE = 24;
const MIN_CROP_SIZE = 60;
const PREVIEW_PADDING = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRatioValue(ratio: AspectRatio): number | null {
  switch (ratio) {
    case '1:1':
      return 1;
    case '16:9':
      return 16 / 9;
    case '4:3':
      return 4 / 3;
    default:
      return null;
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ImageCropPicker: React.FC<ImageCropPickerProps> = ({
  onCropComplete,
  onCancel,
  aspectRatio: initialAspectRatio = 'free',
  quality = 0.9,
}) => {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageLayout, setImageLayout] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });
  const [cropBox, setCropBox] = useState<CropBox>({
    x: 40,
    y: 40,
    width: 200,
    height: 200,
  });
  const [aspectRatio, setAspectRatio] =
    useState<AspectRatio>(initialAspectRatio);
  const [modalVisible, setModalVisible] = useState(false);

  const activeHandle = useRef<DragHandle>(null);
  const lastGesture = useRef({ x: 0, y: 0 });
  const cropBoxRef = useRef<CropBox>(cropBox);

  cropBoxRef.current = cropBox;

  // ─── Image Picking ────────────────────────────────────────────────────────

  const pickFromLibrary = () => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 1 },
      handlePickerResponse,
    );
  };

  const pickFromCamera = () => {
    launchCamera({ mediaType: 'photo', quality: 1 }, handlePickerResponse);
  };

  const handlePickerResponse = (response: ImagePickerResponse) => {
    if (response.didCancel || response.errorCode) return;
    const asset: Asset | undefined = response.assets?.[0];
    if (!asset?.uri) return;

    setImageUri(asset.uri);
    setNaturalSize({ width: asset.width ?? 1, height: asset.height ?? 1 });
    setModalVisible(true);
  };

  // ─── Layout: init crop box once image renders ─────────────────────────────

  const onImageLayout = useCallback(
    (layout: { x: number; y: number; width: number; height: number }) => {
      setImageLayout(layout);
      const pad = HANDLE_SIZE;
      const w = layout.width - pad * 2;
      const h = layout.height - pad * 2;
      const initial = buildCropBox(pad, pad, w, h, aspectRatio);
      setCropBox(initial);
    },
    [aspectRatio],
  );

  // ─── Crop Box Builder (respects ratio) ───────────────────────────────────

  function buildCropBox(
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: AspectRatio,
  ): CropBox {
    const r = getRatioValue(ratio);
    if (r !== null) {
      const newH = w / r;
      return { x, y, width: w, height: newH };
    }
    return { x, y, width: w, height: h };
  }

  // ─── Pan Responder ────────────────────────────────────────────────────────

  const getHandleAt = (px: number, py: number): DragHandle => {
    const b = cropBoxRef.current;
    const hs = HANDLE_SIZE;

    if (Math.abs(px - b.x) < hs && Math.abs(py - b.y) < hs) return 'tl';
    if (Math.abs(px - (b.x + b.width)) < hs && Math.abs(py - b.y) < hs)
      return 'tr';
    if (Math.abs(px - b.x) < hs && Math.abs(py - (b.y + b.height)) < hs)
      return 'bl';
    if (
      Math.abs(px - (b.x + b.width)) < hs &&
      Math.abs(py - (b.y + b.height)) < hs
    )
      return 'br';
    if (px > b.x && px < b.x + b.width && py > b.y && py < b.y + b.height)
      return 'move';
    return null;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (e: GestureResponderEvent) => {
        const { locationX, locationY } = e.nativeEvent;
        activeHandle.current = getHandleAt(locationX, locationY);
        lastGesture.current = { x: locationX, y: locationY };
      },

      onPanResponderMove: (
        _: GestureResponderEvent,
        gs: PanResponderGestureState,
      ) => {
        const dx = gs.moveX - lastGesture.current.x;
        const dy = gs.moveY - lastGesture.current.y;
        lastGesture.current = { x: gs.moveX, y: gs.moveY };

        setCropBox(prev => {
          return updateCropBox(prev, activeHandle.current, dx, dy);
        });
      },

      onPanResponderRelease: () => {
        activeHandle.current = null;
      },
    }),
  ).current;

  const updateCropBox = (
    prev: CropBox,
    handle: DragHandle,
    dx: number,
    dy: number,
  ): CropBox => {
    const { x, y, width, height } = prev;
    const il = imageLayout;
    const ratio = getRatioValue(aspectRatio);

    let nx = x,
      ny = y,
      nw = width,
      nh = height;

    switch (handle) {
      case 'move':
        nx = clamp(x + dx, il.x, il.x + il.width - width);
        ny = clamp(y + dy, il.y, il.y + il.height - height);
        break;
      case 'tl':
        nw = Math.max(MIN_CROP_SIZE, width - dx);
        nh = ratio ? nw / ratio : Math.max(MIN_CROP_SIZE, height - dy);
        nx = x + (width - nw);
        ny = y + (height - nh);
        break;
      case 'tr':
        nw = Math.max(MIN_CROP_SIZE, width + dx);
        nh = ratio ? nw / ratio : Math.max(MIN_CROP_SIZE, height - dy);
        ny = y + (height - nh);
        break;
      case 'bl':
        nw = Math.max(MIN_CROP_SIZE, width - dx);
        nh = ratio ? nw / ratio : Math.max(MIN_CROP_SIZE, height + dy);
        nx = x + (width - nw);
        break;
      case 'br':
        nw = Math.max(MIN_CROP_SIZE, width + dx);
        nh = ratio ? nw / ratio : Math.max(MIN_CROP_SIZE, height + dy);
        break;
    }

    // Clamp to image bounds
    nx = clamp(nx, il.x, il.x + il.width - nw);
    ny = clamp(ny, il.y, il.y + il.height - nh);
    nw = Math.min(nw, il.x + il.width - nx);
    nh = Math.min(nh, il.y + il.height - ny);

    return { x: nx, y: ny, width: nw, height: nh };
  };

  // ─── Aspect Ratio Switch ──────────────────────────────────────────────────

  const switchRatio = (ratio: AspectRatio) => {
    setAspectRatio(ratio);
    if (imageLayout.width === 0) return;
    const r = getRatioValue(ratio);
    setCropBox(prev => {
      if (r === null) return prev;
      const newH = prev.width / r;
      return { ...prev, height: newH };
    });
  };

  // ─── Confirm Crop ─────────────────────────────────────────────────────────

  const confirmCrop = () => {
    if (!imageUri || imageLayout.width === 0) return;

    const scaleX = naturalSize.width / imageLayout.width;
    const scaleY = naturalSize.height / imageLayout.height;

    const cropRegion: CropRegion = {
      x: Math.round((cropBox.x - imageLayout.x) * scaleX),
      y: Math.round((cropBox.y - imageLayout.y) * scaleY),
      width: Math.round(cropBox.width * scaleX),
      height: Math.round(cropBox.height * scaleY),
    };

    onCropComplete({
      uri: imageUri,
      width: cropRegion.width,
      height: cropRegion.height,
      cropRegion,
    });

    setModalVisible(false);
  };

  const cancel = () => {
    setModalVisible(false);
    setImageUri(null);
    onCancel?.();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Picker Buttons */}
      <View style={styles.pickerRow}>
        <TouchableOpacity style={styles.btn} onPress={pickFromLibrary}>
          <Text style={styles.btnText}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={pickFromCamera}>
          <Text style={styles.btnText}>Camera</Text>
        </TouchableOpacity>
      </View>

      {/* Crop Modal */}
      <Modal visible={modalVisible} animationType="slide" statusBarTranslucent>
        <View style={styles.modal}>
          {/* Image + Crop Overlay */}
          <View style={styles.imageContainer} {...panResponder.panHandlers}>
            {imageUri && (
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                resizeMode="contain"
                onLayout={e => onImageLayout(e.nativeEvent.layout)}
              />
            )}

            {/* Dark overlay (4 pieces around crop box) */}
            {imageLayout.width > 0 && (
              <>
                <View
                  style={[
                    styles.overlay,
                    {
                      top: imageLayout.y,
                      left: imageLayout.x,
                      width: imageLayout.width,
                      height: cropBox.y - imageLayout.y,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.overlay,
                    {
                      top: cropBox.y + cropBox.height,
                      left: imageLayout.x,
                      width: imageLayout.width,
                      height:
                        imageLayout.y +
                        imageLayout.height -
                        (cropBox.y + cropBox.height),
                    },
                  ]}
                />
                <View
                  style={[
                    styles.overlay,
                    {
                      top: cropBox.y,
                      left: imageLayout.x,
                      width: cropBox.x - imageLayout.x,
                      height: cropBox.height,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.overlay,
                    {
                      top: cropBox.y,
                      left: cropBox.x + cropBox.width,
                      width:
                        imageLayout.x +
                        imageLayout.width -
                        (cropBox.x + cropBox.width),
                      height: cropBox.height,
                    },
                  ]}
                />

                {/* Crop Border */}
                <View
                  style={[
                    styles.cropBorder,
                    {
                      top: cropBox.y,
                      left: cropBox.x,
                      width: cropBox.width,
                      height: cropBox.height,
                    },
                  ]}
                >
                  {/* Grid lines */}
                  <View style={[styles.gridLine, styles.gridV1]} />
                  <View style={[styles.gridLine, styles.gridV2]} />
                  <View style={[styles.gridLine, styles.gridH1]} />
                  <View style={[styles.gridLine, styles.gridH2]} />
                </View>

                {/* Corner Handles */}
                {(['tl', 'tr', 'bl', 'br'] as const).map(corner => {
                  const isLeft = corner.includes('l');
                  const isTop = corner.includes('t');
                  return (
                    <View
                      key={corner}
                      style={[
                        styles.handle,
                        {
                          top: isTop
                            ? cropBox.y - HANDLE_SIZE / 2
                            : cropBox.y + cropBox.height - HANDLE_SIZE / 2,
                          left: isLeft
                            ? cropBox.x - HANDLE_SIZE / 2
                            : cropBox.x + cropBox.width - HANDLE_SIZE / 2,
                        },
                      ]}
                    />
                  );
                })}
              </>
            )}
          </View>

          {/* Aspect Ratio Bar */}
          <View style={styles.ratioBar}>
            {(['free', '1:1', '16:9', '4:3'] as AspectRatio[]).map(r => (
              <TouchableOpacity
                key={r}
                onPress={() => switchRatio(r)}
                style={[
                  styles.ratioBtn,
                  aspectRatio === r && styles.ratioBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.ratioText,
                    aspectRatio === r && styles.ratioTextActive,
                  ]}
                >
                  {r.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={confirmCrop}>
              <Text style={styles.confirmText}>Crop</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  pickerRow: { flexDirection: 'row', gap: 16 },
  btn: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnText: { color: '#e0e0ff', fontSize: 16, fontWeight: '600' },

  modal: { flex: 1, backgroundColor: '#0d0d0d' },

  imageContainer: {
    flex: 1,
    backgroundColor: '#000',
    marginTop: Platform.OS === 'ios' ? 50 : 24,
  },
  image: { width: '100%', height: '100%' },

  overlay: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },

  cropBorder: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#fff',
    overflow: 'hidden',
  },

  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.3)' },
  gridV1: { left: '33.3%', top: 0, width: 1, height: '100%' },
  gridV2: { left: '66.6%', top: 0, width: 1, height: '100%' },
  gridH1: { top: '33.3%', left: 0, height: 1, width: '100%' },
  gridH2: { top: '66.6%', left: 0, height: 1, width: '100%' },

  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    backgroundColor: '#fff',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#1a1a2e',
    zIndex: 10,
  },

  ratioBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    backgroundColor: '#111',
  },
  ratioBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  ratioBtnActive: { backgroundColor: '#1a1a2e', borderColor: '#4f4fff' },
  ratioText: { color: '#888', fontSize: 13, fontWeight: '500' },
  ratioTextActive: { color: '#a0a0ff' },

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
  cancelText: { color: '#aaa', fontSize: 16 },
  confirmBtn: {
    flex: 1,
    marginLeft: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4f4fff',
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default ImageCropPicker;
