import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { FormScreen } from '../../ui/FormScreen';
import { AppTextField } from '../../ui/AppTextField';
import { PhoneField } from '../../ui/PhoneField';
import { AppButton } from '../../ui/AppButton';
import { Select, type SelectOption } from '../../ui/Select';
import { PhotoPicker } from '../../ui/PhotoPicker';
import { useAsync, useAsyncAction } from '../../ui/hooks';
import { emitToast } from '../../ui/toastBus';
import { theme } from '../../ui/theme';
import { useAuth } from '../../auth/AuthContext';
import type { ResourceClients } from '../../resources';
import type { PublicCommunity, PublicUnit } from '../../resources/onboardingClient';
import type { LocalFile } from '../../resources/fileClient';

export interface RegisterScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

function warn(message: string): void {
  emitToast({ tone: 'error', title: 'Check the form', message });
}

export function RegisterScreen({ resources, onBack }: RegisterScreenProps) {
  const { adoptSession } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);

  const [communitySearch, setCommunitySearch] = useState('');
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState('');
  const [unitId, setUnitId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [photo, setPhoto] = useState<LocalFile | null>(null);

  const query = communitySearch.trim();
  const communities = useAsync<PublicCommunity[]>(
    (signal) =>
      communityId || query.length < 2
        ? Promise.resolve([])
        : resources.onboarding.searchCommunities(query, { signal }),
    [resources, communitySearch, communityId],
  );

  const units = useAsync<PublicUnit[]>(
    (signal) =>
      communityId
        ? resources.onboarding.listUnits(communityId, undefined, { signal })
        : Promise.resolve([]),
    [resources, communityId],
  );

  const unitOptions: SelectOption[] = useMemo(
    () => (units.data ?? []).map((u) => ({ value: u.id, label: `Unit ${u.unitNumber}` })),
    [units.data],
  );

  const phoneValid = /^\+\d{6,}$/.test(phone.trim());

  const submit = useAsyncAction(async () => {
    const photoBase64 = photo ? await toDataUrl(photo) : undefined;
    const result = await resources.onboarding.selfRegister({
      communityId: communityId!,
      unitId: unitId!,
      name: name.trim(),
      phone: phone.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
      password,
      ...(photoBase64 ? { photoBase64 } : {}),
    });
    await adoptSession(result.login, name.trim());
  });

  const selectCommunity = (c: PublicCommunity) => {
    setCommunityId(c.id);
    setCommunityName(c.name);
    setUnitId(null);
  };

  const changeCommunity = () => {
    setCommunityId(null);
    setCommunityName('');
    setUnitId(null);
    setCommunitySearch('');
  };

  const goNext = () => {
    if (!communityId) {
      warn('Search and select your community.');
      return;
    }
    if (!unitId) {
      warn('Select your unit.');
      return;
    }
    setStep(2);
  };

  const onSubmit = () => {
    if (!name.trim()) {
      warn('Enter your name.');
      return;
    }
    if (!phoneValid) {
      warn('Enter a valid phone number.');
      return;
    }
    if (password.length < 6) {
      warn('Enter a password (at least 6 characters).');
      return;
    }
    if (!photo) {
      warn('Add a photo to continue.');
      return;
    }
    void submit.run();
  };

  if (step === 1) {
    return (
      <FormScreen title="Register" subtitle="Find your home" {...(onBack ? { onBack } : {})}>
        <View style={styles.group}>
          {communityId ? (
            <View style={styles.selectedRow}>
              <View style={styles.selectedText}>
                <Text style={styles.selectedLabel}>Your community</Text>
                <Text style={styles.selectedValue}>{communityName}</Text>
              </View>
              <Text style={styles.change} onPress={changeCommunity} accessibilityRole="button">
                Change
              </Text>
            </View>
          ) : (
            <>
              <AppTextField
                label="Your community"
                value={communitySearch}
                onChangeText={setCommunitySearch}
                placeholder="Type your society name"
                autoCapitalize="words"
              />
              {communities.loading ? <Text style={styles.note}>Searching…</Text> : null}
              {!communities.loading && query.length >= 2 && (communities.data ?? []).length === 0 ? (
                <Text style={styles.note}>No community found for “{query}”.</Text>
              ) : null}
              <View style={styles.results}>
                {(communities.data ?? []).map((c) => (
                  <Text
                    key={c.id}
                    style={styles.resultRow}
                    onPress={() => selectCommunity(c)}
                    accessibilityRole="button"
                  >
                    {c.name}
                  </Text>
                ))}
              </View>
            </>
          )}
        </View>

        {communityId ? (
          <View style={styles.group}>
            <Select
              label="Your unit"
              required
              value={unitId}
              options={unitOptions}
              onChange={setUnitId}
              placeholder={units.loading ? 'Loading…' : 'Select your unit'}
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          <AppButton title="Next" onPress={goNext} accessibilityHint="Continue to your details" />
        </View>
      </FormScreen>
    );
  }

  return (
    <FormScreen title="Register" subtitle="Your details" onBack={() => setStep(1)}>
      <View style={styles.card}>
        <PhotoPicker
          label="Your photo"
          required
          layout="vertical"
          files={resources.files}
          upload={{ owningResourceType: 'Resident', communityId: communityId ?? '' }}
          value={null}
          onChange={() => {}}
          onPickLocal={setPhoto}
          disabled={submit.running}
        />

        <View style={styles.divider} />

        <AppTextField label="Full name" required value={name} onChangeText={setName} placeholder="e.g. Ramesh Patel" autoCapitalize="words" editable={!submit.running} />
        <PhoneField label="Phone number" required value={phone} onChangeText={setPhone} editable={!submit.running} placeholder="98765 43210" />
        <AppTextField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" editable={!submit.running} />
        <AppTextField label="Password" required value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 6 characters" autoCapitalize="none" editable={!submit.running} />

        <AppButton title="Create account" loading={submit.running} onPress={onSubmit} accessibilityHint="Creates your account and signs you in" />
      </View>
    </FormScreen>
  );
}

async function toDataUrl(file: LocalFile): Promise<string> {
  const base64 = await readAsStringAsync(file.uri, { encoding: EncodingType.Base64 });
  const mime = file.mimeType || 'image/png';
  return `data:${mime};base64,${base64}`;
}

const styles = StyleSheet.create({
  group: { gap: theme.spacing.md, marginBottom: theme.spacing.lg },
  card: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
  },
  divider: { height: 1, backgroundColor: theme.color.border },
  note: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, lineHeight: 18 },
  results: { gap: theme.spacing.xs },
  resultRow: {
    fontSize: theme.fontSize.body,
    color: theme.color.text,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
  },
  selectedText: { flex: 1, gap: 2 },
  selectedLabel: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  selectedValue: { fontSize: theme.fontSize.body, fontWeight: '600', color: theme.color.text },
  change: { fontSize: theme.fontSize.label, fontWeight: '600', color: theme.color.primary, paddingLeft: theme.spacing.md },
  actions: { marginTop: theme.spacing.sm },
});
