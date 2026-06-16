import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.luckyvr.cardpacksim',
  appName: 'Card Pack Simulator',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
