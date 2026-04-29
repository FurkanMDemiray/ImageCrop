import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import ImageCropPicker, { CroppedImage } from './ImageCropPicker';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  const [result, setResult] = useState<CroppedImage | null>(null);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <ImageCropPicker
          aspectRatio="free"
          quality={0.9}
          onCropComplete={img => {
            setResult(img);
            console.log('Crop region:', img.cropRegion);
          }}
          onCancel={() => console.log('Cancelled')}
        />

        {result && (
          <View style={styles.preview}>
            <Text style={styles.label}>
              {result.cropRegion.width} x {result.cropRegion.height}px
            </Text>
            <Image source={{ uri: result.uri }} style={styles.previewImage} />
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d0d0d',
  },
  preview: { marginTop: 24, alignItems: 'center' },
  label: { color: '#aaa', marginBottom: 8, fontSize: 13 },
  previewImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    resizeMode: 'cover',
  },
});
