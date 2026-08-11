import ExpoShareContent, {
  type SharedContentItem,
  type SharePayload,
} from 'expo-share-content';
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Image,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

function formatTimestamp(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return String(timestamp);
  }
}

function formatBytes(size?: number): string {
  if (size == null || !Number.isFinite(size) || size < 0) {
    return '—';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function typeLabel(type: SharedContentItem['type']): string {
  switch (type) {
    case 'text':
      return 'Text';
    case 'url':
      return 'URL';
    case 'image':
      return 'Image';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'file':
      return 'File';
    default:
      return type;
  }
}

function typeAccent(type: SharedContentItem['type']): string {
  switch (type) {
    case 'text':
      return '#2563eb';
    case 'url':
      return '#0891b2';
    case 'image':
      return '#c026d3';
    case 'video':
      return '#7c3aed';
    case 'audio':
      return '#ea580c';
    case 'file':
      return '#475569';
    default:
      return '#64748b';
  }
}

function MetaRow({ label, value, selectable = true }: { label: string; value: string; selectable?: boolean }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text selectable={selectable} style={styles.metaValue}>
        {value}
      </Text>
    </View>
  );
}

function SharedItemCard({ item, index }: { item: SharedContentItem; index: number }) {
  const accent = typeAccent(item.type);
  const hasText = typeof item.text === 'string' && item.text.length > 0;
  const hasUri = typeof item.uri === 'string' && item.uri.length > 0;
  const isImage = item.type === 'image' && hasUri;
  const isLink = item.type === 'url' && hasText;

  return (
    <View style={[styles.itemCard, { borderLeftColor: accent }]}>
      <View style={styles.itemHeader}>
        <View style={[styles.typeBadge, { backgroundColor: accent }]}>
          <Text style={styles.typeBadgeText}>
            #{index + 1} · {typeLabel(item.type)}
          </Text>
        </View>
        {item.mimeType ? (
          <Text selectable style={styles.mimeHint}>
            {item.mimeType}
          </Text>
        ) : null}
      </View>

      {hasText ? (
        <View style={styles.contentBlock}>
          <Text style={styles.contentLabel}>
            {item.type === 'url' ? 'Link' : item.type === 'text' ? 'Text content' : 'Text'}
          </Text>
          {isLink ? (
            <Pressable
              onPress={() => {
                void Linking.openURL(item.text!);
              }}
            >
              <Text selectable style={styles.linkText}>
                {item.text}
              </Text>
            </Pressable>
          ) : (
            <Text selectable style={styles.bodyText}>
              {item.text}
            </Text>
          )}
        </View>
      ) : null}

      {isImage ? (
        <View style={styles.contentBlock}>
          <Text style={styles.contentLabel}>Preview</Text>
          <Image
            source={{ uri: item.uri }}
            style={styles.imagePreview}
            resizeMode="contain"
            accessibilityLabel={item.fileName ?? 'Shared image preview'}
          />
        </View>
      ) : null}

      {(hasUri || item.fileName || item.size != null) && (
        <View style={styles.contentBlock}>
          {item.fileName ? <MetaRow label="File name" value={item.fileName} /> : null}
          {item.size != null ? <MetaRow label="Size" value={formatBytes(item.size)} selectable={false} /> : null}
          {hasUri ? <MetaRow label="URI" value={item.uri!} /> : null}
        </View>
      )}

      {!hasText && !hasUri ? (
        <Text style={styles.emptyItem}>No text or URI on this item.</Text>
      ) : null}

      <Text selectable style={styles.itemId}>
        item id: {item.id}
      </Text>
    </View>
  );
}

function ShareCard({
  share,
  onAcknowledge,
}: {
  share: SharePayload;
  onAcknowledge: (shareId: string) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{share.title?.trim() || 'Shared content'}</Text>
        <Text style={styles.cardSubtitle}>
          {formatTimestamp(share.timestamp)} · {share.items.length} item
          {share.items.length === 1 ? '' : 's'} · {share.source}
        </Text>
      </View>

      <View style={styles.cardMeta}>
        <MetaRow label="Share ID" value={share.id} />
      </View>

      {share.items.length === 0 ? (
        <Text style={styles.emptyItem}>This share has no items.</Text>
      ) : (
        share.items.map((item, index) => (
          <SharedItemCard key={item.id} item={item} index={index} />
        ))
      )}

      <Pressable onPress={() => setShowRaw((value) => !value)} style={styles.rawToggle}>
        <Text style={styles.rawToggleText}>{showRaw ? 'Hide raw JSON' : 'Show raw JSON'}</Text>
      </Pressable>
      {showRaw ? (
        <Text selectable style={styles.payload}>
          {JSON.stringify(share, null, 2)}
        </Text>
      ) : null}

      <Button title="Acknowledge" onPress={() => onAcknowledge(share.id)} />
    </View>
  );
}

export default function App() {
  const [shares, setShares] = useState<SharePayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

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
      setLastEventAt(new Date().toLocaleTimeString());
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Expo Share Content</Text>
        <Text style={styles.instructions}>
          Open another app, choose Share, then select “Expo Share Content Example” on Android or
          “Share to Example” on iOS. Received text, links, images, and files show below with a
          readable preview (not only raw JSON).
        </Text>

        <View style={styles.statusBox}>
          <Text style={styles.statusLine}>Platform: {Platform.OS}</Text>
          <Text style={styles.statusLine}>Pending shares: {shares.length}</Text>
          <Text style={styles.statusLine}>
            Last live event: {lastEventAt ?? 'none yet (pull Refresh after cold start)'}
          </Text>
        </View>

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

        <Text style={styles.heading}>Received content</Text>

        {shares.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Chưa có share nào</Text>
            <Text style={styles.emptyBody}>
              Khi app nhận được dữ liệu từ Share Sheet, text/URL sẽ hiện rõ ở đây; ảnh có preview;
              file hiện tên, MIME, kích thước và URI.
            </Text>
          </View>
        ) : (
          shares.map((share) => (
            <ShareCard key={share.id} share={share} onAcknowledge={(id) => void acknowledge(id)} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  content: { gap: 16, padding: 20, paddingBottom: 40 },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '700' },
  instructions: { color: '#475569', fontSize: 16, lineHeight: 24 },
  statusBox: {
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    gap: 4,
    padding: 12,
  },
  statusLine: { color: '#334155', fontSize: 14 },
  actions: { gap: 10 },
  heading: { color: '#0f172a', fontSize: 18, fontWeight: '600' },
  emptyState: {
    backgroundColor: '#fff',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    gap: 8,
    padding: 20,
  },
  emptyTitle: { color: '#0f172a', fontSize: 17, fontWeight: '600' },
  emptyBody: { color: '#64748b', fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { gap: 4 },
  cardTitle: { color: '#0f172a', fontSize: 20, fontWeight: '700' },
  cardSubtitle: { color: '#64748b', fontSize: 13 },
  cardMeta: { gap: 4 },
  itemCard: {
    backgroundColor: '#f8fafc',
    borderLeftWidth: 4,
    borderRadius: 10,
    gap: 10,
    padding: 12,
  },
  itemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  mimeHint: { color: '#64748b', flexShrink: 1, fontSize: 12 },
  contentBlock: { gap: 6 },
  contentLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  bodyText: {
    color: '#0f172a',
    fontSize: 17,
    lineHeight: 26,
  },
  linkText: {
    color: '#0369a1',
    fontSize: 17,
    lineHeight: 26,
    textDecorationLine: 'underline',
  },
  imagePreview: {
    alignSelf: 'stretch',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    height: 220,
    width: '100%',
  },
  metaRow: { gap: 2, marginBottom: 6 },
  metaLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: '#1e293b',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    lineHeight: 18,
  },
  itemId: { color: '#94a3b8', fontSize: 11 },
  emptyItem: { color: '#94a3b8', fontStyle: 'italic' },
  rawToggle: { alignSelf: 'flex-start', paddingVertical: 4 },
  rawToggleText: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
  payload: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    color: '#e2e8f0',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11,
    lineHeight: 16,
    overflow: 'hidden',
    padding: 10,
  },
  error: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    color: '#b42318',
    overflow: 'hidden',
    padding: 10,
  },
});
