import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { theme } from '@/theme';
import { AppButton } from '@/components/ui/AppButton';
import { AppTextField } from '@/components/ui/AppTextField';
import { FormBanner } from '@/components/ui/FormBanner';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useAsyncAction } from '@/hooks';
import type { Resident } from '@/types/resident';
import { ResidentVerificationStatus } from '@/types/resident';
import type { ResourceClients } from '@/services/resources';

export interface VerificationActionsProps {
  resources: ResourceClients;
  resident: Resident;
  /** Called after a successful approve/reject so the list can refresh. */
  onChanged: () => void;
}

/**
 * Approve / reject controls for a pending resident (Req 17.2, 17.3). Only rendered for a `pending`
 * resident. Approve calls `verify`; reject opens a required-reason prompt and calls `reject`. Both
 * actions disable while running and surface the normalized API error inline; on success they trigger
 * {@link VerificationActionsProps.onChanged} so the queue reloads (an approved/rejected resident
 * leaves the pending filter).
 */
export function VerificationActions({ resources, resident, onChanged }: VerificationActionsProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const approve = useAsyncAction(() => resources.residents.approve(resident.id));
  const reject = useAsyncAction((r: string) => resources.residents.reject(resident.id, r));

  if (resident.verificationStatus !== ResidentVerificationStatus.Pending) {
    return null;
  }

  const submitReject = async () => {
    const ok = await reject.run(reason.trim());
    if (ok) {
      setRejecting(false);
      setReason('');
      onChanged();
    }
  };

  return (
    <View style={styles.actions}>
      {approve.error ? <FormBanner message={approve.error.message} tone="error" /> : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppButton
            title="Approve"
            loading={approve.running}
            disabled={reject.running}
            onPress={async () => {
              if (await approve.run()) {
                onChanged();
              }
            }}
            accessibilityHint={`Approve ${resident.name}`}
          />
        </View>
        <View style={styles.flex}>
          <AppButton
            title="Reject"
            variant="secondary"
            disabled={approve.running}
            onPress={() => {
              reject.reset();
              setRejecting(true);
            }}
            accessibilityHint={`Reject ${resident.name}`}
          />
        </View>
      </View>

      <Modal visible={rejecting} transparent animationType="fade" onRequestClose={() => setRejecting(false)}>
        <Pressable style={styles.backdrop} accessibilityLabel="Close" onPress={() => setRejecting(false)}>
          <Pressable style={styles.sheet} accessibilityViewIsModal>
            <SectionHeading title={`Reject ${resident.name}`} />
            <AppTextField
              label="Reason"
              value={reason}
              onChangeText={setReason}
              placeholder="Why is this resident rejected?"
              {...(reject.error?.fieldErrors.reason ? { error: reject.error.fieldErrors.reason } : {})}
            />
            {reject.error && !reject.error.fieldErrors.reason ? (
              <FormBanner message={reject.error.message} tone="error" />
            ) : null}
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppButton
                  title="Cancel"
                  variant="secondary"
                  disabled={reject.running}
                  onPress={() => setRejecting(false)}
                />
              </View>
              <View style={styles.flex}>
                <AppButton
                  title="Confirm reject"
                  loading={reject.running}
                  disabled={reason.trim().length === 0}
                  onPress={submitReject}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: theme.spacing.lg },
  sheet: { backgroundColor: theme.color.background, borderRadius: theme.radius.md, padding: theme.spacing.lg, gap: theme.spacing.md },
});
