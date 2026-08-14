module.exports = {
  expo: {
    name: 'Azul',
    slug: 'azul',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.anonymous.azul',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1a56db',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: 'com.anonymous.azul',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    scheme: 'azul',
    plugins: [
      // Preserves android:usesCleartextTraffic="true" across expo prebuilds
      // so dev builds can hit http://<lan-ip>:3000. Remove for production.
      ['expo-build-properties', { android: { usesCleartextTraffic: true } }],
      'expo-web-browser',
      'expo-router',
      'expo-secure-store',
      ['react-native-auth0', { domain: 'dev-cgrr5v7lsr3wbpcj.us.auth0.com' }],
      ['react-native-ble-plx', {
        isBackgroundEnabled: false,
        modes: ['central'],
        bluetoothAlwaysPermission: 'Allow Azul to connect to your irrigation controller',
      }],
      ['expo-location', {
        locationWhenInUsePermission: 'Allow Azul to read your location to sync GPS coordinates to your controller.',
      }],
    ],
  },
};
