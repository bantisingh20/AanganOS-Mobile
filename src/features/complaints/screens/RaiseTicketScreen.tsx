import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { FormBanner } from '@/components/ui/FormBanner';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { useAsyncAction } from '@/hooks';
import { invalidateAsyncCache } from '@/hooks/useAsync';
import { theme } from '@/theme';
import { HelpdeskMasterDataKeys } from '@/types/helpdesk';
import type { Ticket } from '@/types/helpdesk';
import type { ResourceClients } from '@/services/resources';
import { ticketStatusTone, humanizeCode } from '@/utils/status';
import { useMyResident } from '@/features/profile/hooks/useMyResident';

export interface RaiseTicketScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/** How many photo attachments a resident may add to a ticket. */
const MAX_ATTACHMENTS = 4;

/**
 * Resident raise-a-ticket (Req 32.1, 32.3) — a modern, card-based form. The resident's host unit is
 * resolved from the self-scoped {@link useMyResident} (auto-used when they have exactly one; a chooser
 * only appears with several; a clear empty state when none). Title + a multiline description, a
 * configurable category / optional subcategory / optional priority (from the master-data lists —
 * never hardcoded; priority defaults to the community default when blank), and optional **photo**
 * attachments captured via {@link PhotoPicker} (uploaded to File_Service, their references sent as
 * `attachmentFileIds`). On success a confirmation card surfaces the new ticket.
 */
export function RaiseTicketScreen({ resources, onBack }: RaiseTicketScreenProps) {
  const me = useMyResident(resources);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  // Remount key for the PhotoPicker so it clears after each successful add (lets the resident add more).
  const [pickerKey, setPickerKey] = useState(0);
  const [raised, setRaised] = useState<Ticket | null>(null);

  const units = me.data?.units ?? [];
  // Use the resident's unit only when there's exactly one (their only real unit); never guess "the
  // first of many" — a chooser appears when there are several.
  const soleUnitId = units.length === 1 ? (units[0]?.unitId ?? null) : null;
  const effectiveUnitId = unitId ?? soleUnitId;
  const selectedUnit = units.find((u) => u.unitId === effectiveUnitId) ?? null;
  // Community to upload a photo under: the chosen unit's, else the resident's own, else the first
  // unit's. Photos don't depend on a chosen unit, so this keeps the picker available regardless.
  const uploadCommunityId =
    selectedUnit?.communityId ?? me.data?.resident?.communityId ?? units[0]?.communityId ?? null;

  const unitOptions = useMemo(
    () => units.map((u) => ({ value: u.unitId, label: `Unit ${u.unitNumber}` })),
    [units],
  );

  const raise = useAsyncAction(() => {
    if (!effectiveUnitId || !category) {
      return Promise.reject(new Error('Missing fields'));
    }
    return resources.helpdesk
      .createTicket({
        hostUnitId: effectiveUnitId,
        title: title.trim(),
        description: description.trim(),
        category,
        ...(subcategory ? { subcategory } : {}),
        ...(priority ? { priority } : {}),
        ...(attachments.length ? { attachmentFileIds: attachments } : {}),
      })
      .then((t) => {
        setRaised(t);
        invalidateAsyncCache('dash:');
        return t;
      });
  });

  const canSubmit =
    Boolean(effectiveUnitId) &&
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    Boolean(category);

  const onPhotoAdded = (ref: string | null) => {
    if (ref && !attachments.includes(ref)) {
      setAttachments((prev) => [...prev, ref]);
      setPickerKey((k) => k + 1); // reset the picker so another can be added
    }
  };
  const removeAttachment = (ref: string) => setAttachments((prev) => prev.filter((r) => r !== ref));

  const reset = () => {
    setRaised(null);
    setTitle('');
    setDescription('');
    setCategory(null);
    setSubcategory(null);
    setPriority(null);
    setAttachments([]);
    setPickerKey((k) => k + 1);
    raise.reset();
  };

  if (raised) {
    return (
      <FormScreen title="Ticket raised" {...(onBack ? { onBack } : {})}>
        <View style={styles.successHero}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={40} color={theme.color.success} />
          </View>
          <Text style={styles.successTitle}>Your request has been logged</Text>
          <Text style={styles.successSub}>You'll be notified as it's assigned and worked on.</Text>
        </View>
        <View style={styles.card}>
          <View style={[styles.cardIcon, { backgroundColor: `${theme.color.primary}1f` }]}>
            <Ionicons name="construct" size={20} color={theme.color.primary} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>{raised.title}</Text>
            <Text style={styles.cardSub} numberOfLines={1}>{humanizeCode(raised.category)} · {humanizeCode(raised.priority)}</Text>
          </View>
          <Badge label={humanizeCode(raised.status)} tone={ticketStatusTone(raised.status)} />
        </View>
        <View style={styles.actions}>
          <AppButton title="Raise another" onPress={reset} accessibilityHint="Raise another ticket" />
          {onBack ? (
            <AppButton title="Done" variant="secondary" onPress={onBack} accessibilityHint="Return to the helpdesk menu" />
          ) : null}
        </View>
      </FormScreen>
    );
  }

  return (
    <FormScreen title="Raise a ticket" subtitle="Report an issue or request" {...(onBack ? { onBack } : {})}>
      <AsyncBoundary
        loading={me.loading}
        error={me.error}
        empty={!me.loading && units.length === 0}
        emptyMessage="No unit is linked to your account yet, so a ticket can't be raised."
        onRetry={me.reload}
      >
        {/* One clean, modern card holding the whole complaint form (reference style). */}
        <View style={styles.formCard}>
          <Text style={styles.formHeading}>Raise complaint</Text>

          {/* Unit — read-only chip for a single unit, a chooser only when there are several. */}
          {units.length > 1 ? (
            <Select
              label="Unit"
              required
              value={effectiveUnitId}
              options={unitOptions}
              onChange={setUnitId}
              placeholder="Select the unit this is for"
            />
          ) : (
            <View style={styles.unitChip}>
              <Ionicons name="home" size={16} color={theme.color.primary} />
              <Text style={styles.unitChipText}>Unit {units[0]?.unitNumber ?? ''}</Text>
            </View>
          )}

          {/* Complaint type (category). */}
          <MasterDataDropdown
            label="Complaint type"
            required
            listKey={HelpdeskMasterDataKeys.TicketCategory}
            masterData={resources.masterData}
            value={category}
            onChange={setCategory}
            {...(uploadCommunityId ? { communityId: uploadCommunityId } : {})}
            placeholder="Select complaint type"
          />

          {/* Priority (optional) — master-data driven, defaults to the community default. */}
          <MasterDataDropdown
            label="Priority (optional)"
            listKey={HelpdeskMasterDataKeys.TicketPriority}
            masterData={resources.masterData}
            value={priority}
            onChange={setPriority}
            {...(uploadCommunityId ? { communityId: uploadCommunityId } : {})}
            placeholder="Use the community default"
            allowClear
            clearLabel="Community default"
          />

          {/* Title. */}
          <AppTextField
            label="Title"
            required
            value={title}
            onChangeText={setTitle}
            placeholder="Short summary, e.g. Kitchen tap leaking"
            autoCapitalize="sentences"
            {...(raise.error?.fieldErrors.title ? { error: raise.error.fieldErrors.title } : {})}
          />

          {/* Description — the "Brief your complaint" area. */}
          <AppTextField
            label="Brief your complaint"
            required
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the problem and where it is"
            autoCapitalize="sentences"
            multiline
            numberOfLines={5}
            {...(raise.error?.fieldErrors.description ? { error: raise.error.fieldErrors.description } : {})}
          />

          {/* Photo attachments. Added photos show as thumbnail tiles; the PhotoPicker renders its
              own full-width Camera/Gallery actions below (never squeezed into a tiny tile). */}
          <View style={styles.field}>
            <View style={styles.photoHeader}>
              <Text style={styles.fieldLabel}>Attach photos <Text style={styles.optional}>(optional)</Text></Text>
              <Text style={styles.photoCount}>{attachments.length}/{MAX_ATTACHMENTS}</Text>
            </View>

            {attachments.length > 0 ? (
              <View style={styles.photoRow}>
                {attachments.map((ref, i) => (
                  <View key={ref} style={styles.photoTile}>
                    <Ionicons name="image" size={24} color={theme.color.success} />
                    <Text style={styles.photoTileText}>Photo {i + 1}</Text>
                    <Pressable
                      onPress={() => removeAttachment(ref)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove photo ${i + 1}`}
                      hitSlop={6}
                      style={styles.photoRemove}
                    >
                      <Ionicons name="close-circle" size={20} color={theme.color.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {attachments.length < MAX_ATTACHMENTS && uploadCommunityId ? (
              <View style={styles.photoPickerWrap}>
                <PhotoPicker
                  key={pickerKey}
                  label={attachments.length === 0 ? 'Add a photo of the issue' : 'Add another photo'}
                  files={resources.files}
                  upload={{ owningResourceType: 'Ticket', communityId: uploadCommunityId }}
                  value={null}
                  onChange={onPhotoAdded}
                  disabled={raise.running}
                />
              </View>
            ) : null}
          </View>
        </View>

        {raise.error && !raise.error.fieldErrors.title && !raise.error.fieldErrors.description ? (
          <FormBanner message={raise.error.message} tone="error" />
        ) : null}

        <View style={styles.actions}>
          <Pressable
            onPress={() => raise.run()}
            disabled={!canSubmit || raise.running}
            accessibilityRole="button"
            accessibilityLabel="Raise ticket"
            accessibilityHint="Submit this ticket to the helpdesk"
            style={({ pressed }) => [
              styles.submit,
              (!canSubmit || raise.running) ? styles.submitDisabled : null,
              pressed ? styles.submitPressed : null,
            ]}
          >
            <Ionicons
              name={raise.running ? 'hourglass' : 'paper-plane'}
              size={18}
              color="#fff"
            />
            <Text style={styles.submitText}>{raise.running ? 'Submitting…' : 'Raise ticket'}</Text>
          </Pressable>
        </View>
      </AsyncBoundary>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: theme.spacing.sm, gap: theme.spacing.sm },

  // Modern pill submit: bold primary fill, icon + label, soft shadow.
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.md + 2,
    ...theme.shadow.soft,
  },
  submitDisabled: { backgroundColor: theme.color.disabled, shadowOpacity: 0, elevation: 0 },
  submitPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  submitText: { color: '#fff', fontSize: theme.fontSize.body, fontWeight: '800', letterSpacing: 0.3 },

  // --- Modern single-card form (reference "Raise complaint") ---
  formCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadow.soft,
  },
  formHeading: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text, marginBottom: theme.spacing.xs },
  field: { gap: 6 },
  fieldLabel: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.text },
  optional: { fontSize: theme.fontSize.caption, fontWeight: '500', color: theme.color.mutedText },
  unitChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: `${theme.color.primary}14`, borderRadius: theme.radius.pill,
    paddingVertical: 6, paddingHorizontal: theme.spacing.md,
  },
  unitChipText: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.primary },
  photoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoCount: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '700' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: 4 },
  photoTile: {
    width: 84, height: 84, borderRadius: theme.radius.md,
    backgroundColor: `${theme.color.success}14`, alignItems: 'center', justifyContent: 'center', gap: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.border,
  },
  photoTileText: { fontSize: 11, color: theme.color.mutedText, fontWeight: '600' },
  photoRemove: { position: 'absolute', top: -7, right: -7, backgroundColor: theme.color.surface, borderRadius: 10 },
  // The picker renders its own labelled Camera/Gallery actions; give it a soft dashed well so it
  // reads as an "add" area, and let it size naturally (no fixed tiny width).
  photoPickerWrap: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.color.background,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.color.border,
    padding: theme.spacing.md,
  },

  // Success state.
  successHero: { alignItems: 'center', gap: theme.spacing.xs, paddingVertical: theme.spacing.lg },
  successIcon: {
    width: 72, height: 72, borderRadius: theme.radius.pill,
    backgroundColor: '#e6f4ea', alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.xs,
  },
  successTitle: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text, textAlign: 'center' },
  successSub: { fontSize: theme.fontSize.label, color: theme.color.mutedText, textAlign: 'center' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    padding: theme.spacing.md, ...theme.shadow.soft,
  },
  cardIcon: { width: 44, height: 44, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
});
