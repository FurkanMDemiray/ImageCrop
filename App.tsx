import React, { useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import ImageCropPicker, { CroppedImage } from './ImageCropPicker';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function App() {
  const [cropped, setCropped] = useState<CroppedImage | null>(null);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.container}>
          <View style={{ flex: 1 }}>
<ImageCropPicker
          onCropComplete={result => {
            setCropped(result);
            console.log('Crop region (pixels):', result.cropRegion);
          }}
          onCancel={() => console.log('User cancelled')}
        />
          </View>

          {cropped && (
            <View
              style={{
                flex: 1,
                padding: 20,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Image source={{ uri: cropped.uri }} style={styles.preview} />
            </View>
          )}
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  preview: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
    alignSelf: 'center',
  },
});
