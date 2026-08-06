import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors, font, spacing } from './src/theme';
import type { RootStackParamList, RootTabParamList } from './src/navigation/types';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { AskScreen } from './src/screens/AskScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { MealDetailScreen } from './src/screens/MealDetailScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICON: Record<keyof RootTabParamList, string> = {
  Capture: '📷',
  Feed: '🍱',
  Stats: '📊',
  Ask: '✨',
  Profile: '👤',
};

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary },
};

function Tabs() {
  return (
    <Tab.Navigator
      initialRouteName="Capture"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: font.tiny, fontWeight: '700' },
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{TAB_ICON[route.name]}</Text>
        ),
      })}
    >
      <Tab.Screen name="Capture" component={CaptureScreen} />
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Ask" component={AskScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

/** The signed-in app: the existing tab navigator + the root MealDetail stack. */
function AppNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '800' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <RootStack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <RootStack.Screen
          name="MealDetail"
          component={MealDetailScreen}
          options={{ title: 'Meal', headerBackTitle: 'Back' }}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

/** Full-screen brand splash shown while the boot-time token check runs. */
function Splash() {
  return (
    <View style={styles.splash}>
      <Text style={styles.splashBrand}>Morsel</Text>
      <ActivityIndicator color={colors.primary} style={styles.splashSpinner} />
    </View>
  );
}

/**
 * Auth gate. While the persisted token is being validated we show a splash; a
 * logged-out user gets the login screen; a signed-in user gets the full app.
 * (The existing Profile onboarding still works: a signed-in user with no
 * profile lands in the app and the Profile tab jumps straight into its form.)
 */
function RootGate() {
  const { loaded, user } = useAuth();
  if (!loaded) return <Splash />;
  if (!user) return <LoginScreen />;
  return <AppNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <RootGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  splashBrand: {
    fontSize: font.h1,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  splashSpinner: { marginTop: spacing.lg },
});
