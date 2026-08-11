import ExpoShareContent, { type SharePayload } from 'expo-share-content';
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function App() {
  const [shares, setShares] = useState<SharePayload[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setShares(await ExpoShareContent.getPendingSharesAsync());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const acknowledge = useCallback(async (shareId: string) => {
    try {
      await ExpoShareContent.clearPendingSharesAsync([shareId]);
      setShares((current) => current.filter((share) => share.id !== shareId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const shareSubscription = ExpoShareContent.addShareListener((payload) => {
      setShares((current) =>
        current.some((share) => share.id === payload.id) ? current : [...current, payload]
      );
    });
    const errorSubscription = ExpoShareContent.addShareErrorListener((event) => {
      setError(`${event.code}: ${event.message}`);
    });

    return () => {
      shareSubscription.remove();
      errorSubscription.remove();
    };
  }, [refresh]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Expo Share Content</Text>
        <Text style={styles.instructions}>
          Open another app, choose Share, then select “Expo Share Content Example” on Android or
          “Share to Example” on iOS.
        </Text>

        <View style={styles.actions}>
          <Button title="Refresh queue" onPress={() => void refresh()} />
          <Button
            title="Clear queue"
            color="#b42318"
            onPress={async () => {
              try {
                await ExpoShareContent.clearPendingSharesAsync();
                setShares([]);
                setError(null);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
              }
            }}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.heading}>Pending shares: {shares.length}</Text>
        {shares.map((share) => (
          <View key={share.id} style={styles.card}>
            <Text selectable style={styles.payload}>
              {JSON.stringify(share, null, 2)}
            </Text>
            <Button
              title="Acknowledge"
              onPress={() => void acknowledge(share.id)}
            />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  content: { gap: 16, padding: 20 },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '700' },
  instructions: { color: '#475569', fontSize: 16, lineHeight: 24 },
  actions: { gap: 10 },
  heading: { color: '#0f172a', fontSize: 18, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, gap: 12, padding: 14 },
  payload: { color: '#1e293b', fontFamily: 'Courier', fontSize: 12 },
  error: { color: '#b42318' },
});
