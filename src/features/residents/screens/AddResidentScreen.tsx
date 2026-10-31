import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FormScreen } from '@/components/ui/FormScreen';
import { FormSection } from '@/components/ui/FormSection';
import { AppTextField } from '@/components/ui/AppTextField';
import { PhoneField } from '@/components/ui/PhoneField';
import { AppButton } from '@/components/ui/AppButton';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { useAsync, useAsyncAction } from '@/hooks';
import { showSuccessAlert } from '@/utils/errorAlert';
import { emitToast } from '@/utils/toastBus';
import { theme } from '@/theme';
import { DEFAULT_PAGE_SIZE } from '@/types/query';
import type { PagedData } from '@/types/envelope';
import type { Unit } from '@/types/community';
import type { ResourceClients } from '@/services/resources';

export interface AddResidentScreenProps {
  resources: ResourceClients;
  /** Called after a resident is created so the caller can refresh + navigate back. */
  onSaved?: () => void;
  onBack?: () => void;
}

/** An available unit = a unit with no owner in its active household. */
interface AvailableUnit {
  readonly unit: Unit;
}

/** Raise a client-side validation toast. */
function warn(message: string): void {
  emitToast({ tone: 'error', title: 'Check the form', message });
}

/**
 * Admin "Add resident" (owner) flow. Creates a new resident as the OWNER of an available (owner-less)
 * unit, and optionally creates their login (email/phone + password) in the same flow. The unit
 * dropdown is filtered to units that have no owner yet — once a unit has an owner it drops off the
 * list, so an owner can be defined exactly once per unit. On submit: create resident (owner) → link
 * to the unit as owner → (optional) create login (hashed server-side + Resident role scoped to the
 * community). Uses the shared {@link FormScreen} scaffold.
 */
export function AddResidentScreen({ resources, onSaved, onBack }: AddResidentScreenProps) {
  const available = useAsync<AvailableUnit[]>(
    async (signal) => {
      const page: PagedData<Unit> = await resources.units.list(
        { pageSize: DEFAULT_PAGE_SIZE },
        { availableForOwner: true },
        { signal },
      );
      return page.items.map((unit) => ({ unit } as AvailableUnit));
    },
    [],
  );

  const options: SelectOption[] = useMemo(
    () => (available.data ?? []).map((a) => ({ value: a.unit.id, label: `Unit ${a.unit.unitNumber}` })),
    [available.data],
  );

  const [unitId, setUnitId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(''); // combined E.164-ish, e.g. +9198...
  const [email, setEmail] = useState('');
  const [createLogin, setCreateLogin] = useState(true);
  const [password, setPassword] = useState('');

  const selectedUnit = (available.data ?? []).find((a) => a.unit.id === unitId)?.unit ?? null;
  // A phone has digits after the dial code (more than just "+91").
  const phoneValid = /^\+\d{6,}$/.test(phone.trim());

  const save = useAsyncAction(async () => {
    const unit = selectedUnit!;
    // 1) create the resident as the unit owner (phone is the mandatory contact + login id)
    const resident = await resources.residents.create({
      communityId: unit.communityId,
      name: name.trim(),
      residentType: 'owner',
      phone: phone.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
    });
    // 2) link them to the unit as owner
    await resources.residents.addHousehold(resident.id, { unitId: unit.id, relationship: 'owner' });
    // 3) optionally create their login — the PHONE is the login identifier (unique)
    if (createLogin) {
      const res = await resources.residents.createLogin(resident.id, {
        identifier: phone.trim(),
        password,
      });
      showSuccessAlert(`${name.trim()} added as owner of Unit ${unit.unitNumber}. Login: ${res.identifier}`, 'Resident added');
    } else {
      showSuccessAlert(`${name.trim()} added as owner of Unit ${unit.unitNumber}.`, 'Resident added');
    }
    onSaved?.();
  });

  const onSubmit = () => {
    if (!unitId) { warn('Select an available unit.'); return; }
    if (!name.trim()) { warn('Enter the resident\u2019s name.'); return; }
    if (!phoneValid) { warn('Enter a valid contact number.'); return; }
    if (createLogin && password.length < 4) { warn('Enter a password (at least 4 characters).'); return; }
    void save.run();
  };

  return (
    <FormScreen title="Add resident" subtitle="Create a unit owner" {...(onBack ? { onBack } : {})}>
      <FormSection title="Unit" icon="home" tint={theme.color.info}>
        <AsyncBoundary
          loading={available.loading}
          error={available.error}
          empty={!available.loading && options.length === 0}
          emptyMessage="No available units. Every unit already has an owner — add a unit first, or add a family member from the resident's profile."
          onRetry={available.reload}
        >
          <Select
            label="Available unit"
            required
            value={unitId}
            options={options}
            onChange={setUnitId}
            placeholder="Choose a unit without an owner"
          />
          <Text style={styles.note}>Only units that don't have an owner yet are listed.</Text>
        </AsyncBoundary>
      </FormSection>

      <FormSection title="Owner details" icon="person" tint={theme.color.primary}>
        <AppTextField label="Full name" required value={name} onChangeText={setName} placeholder="e.g. Ramesh Patel" autoCapitalize="words" editable={!save.running} />
        <PhoneField label="Contact number" required value={phone} onChangeText={setPhone} editable={!save.running} placeholder="98765 43210" />
        <Text style={styles.note}>The contact number is also used as the login — it must be unique.</Text>
        <AppTextField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" editable={!save.running} />
      </FormSection>

      <FormSection title="Login" icon="key" tint={theme.color.success}>
        <Toggle label="Create a login for this owner" description="They sign in with their phone number" value={createLogin} onValueChange={setCreateLogin} />
        {createLogin ? (
          <>
            <AppTextField label="Password" required value={password} onChangeText={setPassword} secureTextEntry placeholder="Initial password" editable={!save.running} />
            <Text style={styles.note}>They sign in with their contact number and this password (changeable later via "Forgot password").</Text>
          </>
        ) : null}
      </FormSection>

      <View style={styles.actions}>
        <AppButton title="Add resident" loading={save.running} onPress={onSubmit} accessibilityHint="Creates the resident and login" />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, lineHeight: 18 },
  actions: { marginTop: theme.spacing.sm },
});
