import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from './App';

/** Stack navigation object passed to tab screens so they can push detail screens. */
export type AppNav = NativeStackScreenProps<RootStack, 'Main'>['navigation'];
