import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { useAsyncAction } from '@/hooks';
import { showSuccessAlert } from '@/utils/errorAlert';
import { emitToast } from '@/utils/toastBus';
import { theme } from '@/theme';
import { MasterDataKeys } from '@/types/masterData';
import type { Community } from '@/types/community';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface CommunityManageScreenProps {
  resources: ResourceClients;
  community: Community;
  onWings: () => void;
  onViewUnits: () => void;
  onBack?: () => void;
}

/**
 * Management hub for one community (super-admin). A simple list of actions — edit the society (in a
 * bottom sheet, since it's only name + type), manage its wings/structure, or browse/manage its
 * units — each pushing its own route so the hardware back returns here. Keeps the community-admin
 * surface route-based and discoverable without a heavy menu. Uses the shared {@link FormScreen}.
 */
export function CommunityManageScreen({
  resources,
  community,
  onWings,
  onViewUnits,
  onBack,
}: CommunityManageScreenProps) {
  // Reflect edits locally so the header (name/type) updates without a round-trip to the list.
  const [current, setCurrent] = useState<Community>(community);
  useEffect(() => { setCurrent(community); }, [community]);
  const [editing, setEditing] = useState(false);

  return (
    <FormScreen title={current.name} subtitle={humanizeCode(current.communityType)} {...(onBack ? { onBack } : {})}>
      <ActionRow icon="create-outline" tint={theme.color.primary} label="Edit community" hint="Change name or type" onPress={() => setEditing(true)} />
      <ActionRow icon="git-branch-outline" tint="#8250df" label="Wings & structure" hint="Add wings, buildings, floors" onPress={onWings} />
      <ActionRow icon="grid-outline" tint={theme.color.info} label="Manage units" hint="Browse, add or edit units" onPress={onViewUnits} />

      <EditCommunitySheet
        resources={resources}
        community={current}
        visible={editing}
        onClose={() => setEditing(false)}
        onSaved={(updated) => { setCurrent(updated); setEditing(false); }}
      />
    </FormScreen>
  );
}

/**
 * Keyboard-avoiding bottom-sheet form to edit a community's name + type (Req 12.2) — the same sheet
 * pattern as the Security/Resident/Unit/Wings admin screens. Only two fields, so a full page would
 * be overkill; this edits in place and reports the updated community back to the hub.
 */
function EditCommunitySheet({
  resources,
  community,
  visible,
  onClose,
  onSaved,
}: {
  resources: ResourceClients;
  community: Community;
  visible: boolean;
  onClose: () => void;
  onSaved: (updated: Community) => void;
}) {
  const [name, setName] = useState(community.name);
  const [communityType, setCommunityType] = useState<string | null>(community.communityType);

  // Reset the fields whenever the sheet opens for a (possibly new) community.
  useEffect(() => {
    if (visible) {
      setName(community.name);
      setCommunityType(community.communityType);
    }
  }, [visible, community]);

  const save = useAsyncAction(async () => {
    const updated = await resources.communities.update(community.id, {
      name: name.trim(),
      communityType: communityType!,
    });
    showSuccessAlert('Community updated.');
    onSaved(updated);
  });

  const onSubmit = () => {
    if (!name.trim()) { emitToast({ tone: 'error', title: 'Check the form', message: 'Enter a community name.' }); return; }
    if (!communityType) { emitToast({ tone: 'error', title: 'Check the form', message: 'Choose a community type.' }); return; }
    void save.run();
  };

  return (
    <BottomSheet
      visible={visible}
      title="Edit community"
      onClose={onClose}
      footer={<AppButton title="Save changes" loading={save.running} onPress={onSubmit} accessibilityHint="Saves the community name and type" />}
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
        <AppTextField
          label="Name"
          required
          value={name}
          onChangeText={setName}
          placeholder="e.g. Shree Krishna Residency"
          editable={!save.running}
          {...(save.error?.fieldErrors?.name ? { error: save.error.fieldErrors.name } : {})}
        />
        <MasterDataDropdown
          label="Community type"
          required
          listKey={MasterDataKeys.CommunityType}
          masterData={resources.masterData}
          value={communityType}
          onChange={setCommunityType}
          communityId={community.id}
          placeholder="Choose a type"
        />
      </ScrollView>
    </BottomSheet>
  );
}

function ActionRow({
  icon,
  tint,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={[styles.icon, { backgroundColor: `${tint}1f` }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.color.mutedText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadow.soft,
  },
  pressed: { opacity: 0.7 },
  icon: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  label: { fontSize: theme.fontSize.body, fontWeight: '700', color: theme.color.text },
  hint: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, marginTop: 2 },

  // Bottom-sheet field column (sheet chrome is the shared BottomSheet).
  sheetScroll: { gap: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm },
});
