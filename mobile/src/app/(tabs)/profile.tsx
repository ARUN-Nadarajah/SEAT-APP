import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  Card,
  Field,
  InfoBox,
  SectionTitle,
  useFeedback,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { apiErrorMessage, updateProfile } from '@/services/api';
import { colors, spacing } from '@/theme';

type PrefKey = 'push' | 'email' | 'sms' | 'whatsapp';

const PREF_ROWS: { key: PrefKey; label: string; hint: string }[] = [
  { key: 'push', label: 'Push notifications', hint: 'Instant alerts on this device' },
  { key: 'email', label: 'Email', hint: 'Booking confirmations and receipts' },
  { key: 'sms', label: 'SMS', hint: 'Simulated channel — demo only' },
  { key: 'whatsapp', label: 'WhatsApp', hint: 'Simulated channel — demo only' },
];

/**
 * Profile (spec §5): edit details, notification preferences (incl. the email
 * toggle a test user expected), privacy notice, help and logout.
 */
export default function ProfileScreen() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { showToast } = useFeedback();

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [prefs, setPrefs] = useState({
    push: user?.notificationPrefs?.push ?? true,
    email: user?.notificationPrefs?.email ?? true,
    sms: user?.notificationPrefs?.sms ?? false,
    whatsapp: user?.notificationPrefs?.whatsapp ?? false,
  });
  const [saving, setSaving] = useState(false);
  // Seeded straight from the session: the tab only mounts once the auth
  // provider has hydrated, so no effect is needed to copy values in.

  async function save() {
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() });
      showToast('Profile saved.', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function togglePref(key: PrefKey, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next); // optimistic UI (NFR05)
    try {
      await updateProfile({ notificationPrefs: { [key]: value } });
      showToast(`${key} notifications ${value ? 'on' : 'off'}.`, 'success');
    } catch (error) {
      setPrefs(prefs);
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onLogout() {
    await logout();
    router.replace('/(auth)/login');
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="title">Profile</AppText>
        <AppText variant="secondary">{user?.email}</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Identity card */}
        <Card style={styles.identity}>
          <View style={styles.avatar}>
            <AppText style={styles.avatarText}>
              {(user?.name || 'S').charAt(0).toUpperCase()}
            </AppText>
          </View>
          <View style={styles.identityText}>
            <AppText variant="heading">{user?.name}</AppText>
            <View style={styles.roleRow}>
              <Ionicons name="shield-checkmark-outline" size={13} color={colors.textSecondary} />
              <AppText variant="secondary" style={styles.roleText}>
                {user?.role === 'customer'
                  ? 'Customer'
                  : user?.role === 'staff'
                    ? 'Restaurant staff'
                    : 'Manager'}
              </AppText>
            </View>
          </View>
        </Card>

        {/* Edit details */}
        <Card>
          <SectionTitle>Your details</SectionTitle>
          <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            hint="Used only for table-ready alerts."
          />
          <Button label="Save changes" onPress={save} loading={saving} />
        </Card>

        {/* Notification preferences (spec §5 + email toggle requirement) */}
        <Card>
          <SectionTitle>How we reach you</SectionTitle>
          <AppText variant="secondary">
            Choose your channels. Changes apply immediately.
          </AppText>

          {PREF_ROWS.map((row) => (
            <View key={row.key} style={styles.prefRow}>
              <View style={styles.prefText}>
                <AppText variant="bodyMedium">{row.label}</AppText>
                <AppText variant="caption">{row.hint}</AppText>
              </View>
              <Switch
                value={prefs[row.key]}
                onValueChange={(value) => togglePref(row.key, value)}
                trackColor={{ true: colors.primary, false: colors.borderStrong }}
                thumbColor={colors.surface}
                accessibilityLabel={`${row.label} notifications`}
              />
            </View>
          ))}
        </Card>

        {/* Privacy notice (NFR04) */}
        <InfoBox tone="warning">
          <AppText variant="label">Privacy notice</AppText>
          <AppText variant="secondary">
            SEAT stores your name, email, phone and booking history to run your
            reservations and queue spots. Passwords are hashed with bcrypt and
            API tokens are kept in secure storage. We never collect or store
            payment card details. You can ask us to delete your data at any time
            from Help.
          </AppText>
        </InfoBox>

        <Card>
          <SectionTitle>Help</SectionTitle>
          <AppText variant="secondary">
            Need a hand? Email hello@seat.lk or call +94 21 220 0181 — we reply
            within one working day.
          </AppText>
          <Button label="Contact support" variant="secondary" onPress={() => showToast('Opening your mail app is coming soon.', 'info')} />
        </Card>

        <Button
          label="Log out"
          variant="danger"
          onPress={onLogout}
          loading={authLoading}
          accessibilityLabel="Log out of your account"
        />

        <AppText variant="caption" style={styles.version}>
          SEAT · IT3060 Group 181 · v1.0.0
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accent,
    fontSize: 26,
    fontFamily: 'Fraunces_600SemiBold',
  },
  identityText: { flex: 1, gap: 4 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  roleText: { textTransform: 'capitalize' },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  prefText: { flex: 1, gap: 2 },
  version: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.sm },
});
