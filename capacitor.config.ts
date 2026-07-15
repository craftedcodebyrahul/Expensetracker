import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tcflow.app',
  appName: 'TCFlow',
  webDir: 'dist/Expensetracker/browser',
  server: {
    androidScheme: 'https'
  }
};

export default config;
