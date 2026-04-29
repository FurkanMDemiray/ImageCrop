import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import ImageCropPicker, { CroppedImage } from './ImageCropPicker';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  const [cropped, setCropped] = useState<CroppedImage | null>(null);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <ImageCropPicker
          defaultAspectRatio="free"
          onCropComplete={result => {
            setCropped(result);
            console.log('Crop region (pixels):', result.cropRegion);
          }}
          onCancel={() => console.log('User cancelled')}
        />

        {cropped && (
          <Image source={{ uri: cropped.uri }} style={styles.preview} />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  preview: { width: 200, height: 200, marginTop: 20, alignSelf: 'center' },
});
